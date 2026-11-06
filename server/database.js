import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const usingPostgres = Boolean(process.env.DATABASE_URL)
let sqlite
let pool

const postgresSchema = [
  "CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','agent')), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at BIGINT NOT NULL, last_login_at BIGINT)",
  'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)',
  'CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)',
  'CREATE TABLE IF NOT EXISTS agent_invitations (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by BIGINT NOT NULL REFERENCES users(id), created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, used_at BIGINT)',
  'CREATE INDEX IF NOT EXISTS invitations_expiry_idx ON agent_invitations(expires_at)',
  'CREATE TABLE IF NOT EXISTS commodities (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at BIGINT NOT NULL)',
  "CREATE TABLE IF NOT EXISTS market_observations (id BIGSERIAL PRIMARY KEY, agent_id BIGINT NOT NULL REFERENCES users(id), commodity_id BIGINT NOT NULL REFERENCES commodities(id), market_name TEXT NOT NULL, city TEXT NOT NULL, availability TEXT NOT NULL CHECK (availability IN ('available','unavailable')), price_min INTEGER, price_max INTEGER, price_unit TEXT, comment TEXT NOT NULL DEFAULT '', observed_at BIGINT NOT NULL, CHECK ((availability = 'available' AND price_min IS NOT NULL AND price_max IS NOT NULL AND price_min > 0 AND price_max >= price_min) OR (availability = 'unavailable' AND price_min IS NULL AND price_max IS NULL AND price_unit IS NULL)))",
  'CREATE INDEX IF NOT EXISTS observations_date_idx ON market_observations(observed_at DESC)',
  'CREATE INDEX IF NOT EXISTS observations_agent_idx ON market_observations(agent_id, observed_at DESC)',
  'CREATE INDEX IF NOT EXISTS observations_commodity_idx ON market_observations(commodity_id, observed_at DESC)',
]

function toPostgres(sql) {
  let query = sql.replace(/\s+COLLATE NOCASE/gi, '')
    .replace(/INSERT OR IGNORE INTO commodities/gi, 'INSERT INTO commodities')
    .replace(/ORDER BY name COLLATE NOCASE/gi, 'ORDER BY LOWER(name)')
    .replace(/email\s*=\s*\?/gi, 'LOWER(email) = LOWER(?)')
    .replace(/is_active\s*=\s*1/gi, 'is_active = TRUE')
    .replace(/is_active\s*=\s*0/gi, 'is_active = FALSE')
  if (/^\s*INSERT INTO commodities/i.test(query) && !/ON CONFLICT/i.test(query)) {
    query = query.trim().replace(/;?$/, ' ON CONFLICT (name) DO NOTHING')
  }
  let index = 0
  return query.replace(/\?/g, () => `$${++index}`)
}

function toSqlite(sql) {
  let query = sql.replace(/LOWER\(email\) = LOWER\(\?\)/gi, 'email = ?')
    .replace(/LOWER\(name\)/gi, 'name')
    .replace(/is_active = TRUE/gi, 'is_active = 1')
    .replace(/is_active = FALSE/gi, 'is_active = 0')
    .replace(/ ON CONFLICT \(name\) DO NOTHING/gi, '')
  if (/^\s*INSERT INTO commodities/i.test(sql) && /ON CONFLICT/i.test(sql)) query = query.replace(/INSERT INTO commodities/i, 'INSERT OR IGNORE INTO commodities')
  return query
}

function postgresParams(sql, params) {
  let placeholder = 0
  const booleanIndexes = new Set()
  sql.replace(/\?/g, (match, offset) => {
    if (/is_active\s*=\s*\?\s*$/i.test(sql.slice(0, offset + match.length))) booleanIndexes.add(placeholder)
    placeholder += 1
    return match
  })
  return params.map((value, index) => booleanIndexes.has(index) ? Boolean(value) : value)
}

function sqliteStatement(sql, method, params) {
  return sqlite.prepare(toSqlite(sql))[method](...params)
}

function makeTransactionClient(client) {
  return {
    get: async (sql, params = []) => (await client.query(toPostgres(sql), postgresParams(sql, params))).rows[0],
    all: async (sql, params = []) => (await client.query(toPostgres(sql), postgresParams(sql, params))).rows,
    run: async (sql, params = []) => {
      const query = toPostgres(sql)
      const returningId = /^\s*INSERT/i.test(query) && !/\bRETURNING\b/i.test(query)
      const result = await client.query(returningId ? `${query} RETURNING id` : query, postgresParams(sql, params))
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id }
    },
  }
}

export const database = {
  async get(sql, ...args) {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
    return usingPostgres ? (await pool.query(toPostgres(sql), postgresParams(sql, params))).rows[0] : sqliteStatement(sql, 'get', params)
  },
  async all(sql, ...args) {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
    return usingPostgres ? (await pool.query(toPostgres(sql), postgresParams(sql, params))).rows : sqliteStatement(sql, 'all', params)
  },
  async run(sql, ...args) {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
    if (!usingPostgres) {
      const result = sqliteStatement(sql, 'run', params)
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
    }
    const query = toPostgres(sql)
    const returningId = /^\s*INSERT/i.test(query) && !/\bRETURNING\b/i.test(query)
    const result = await pool.query(returningId ? `${query} RETURNING id` : query, postgresParams(sql, params))
    return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id }
  },
  async transaction(callback) {
    if (!usingPostgres) {
      sqlite.exec('BEGIN IMMEDIATE')
      try { const result = await callback(database); sqlite.exec('COMMIT'); return result }
      catch (error) { try { sqlite.exec('ROLLBACK') } catch { /* transaction already closed */ } throw error }
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(makeTransactionClient(client))
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  },
}

export async function initializeDatabase() {
  if (usingPostgres) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    })
    for (const statement of postgresSchema) await pool.query(statement)
  } else {
    if (process.env.VERCEL) throw new Error('DATABASE_URL is required on Vercel. Configure a hosted PostgreSQL database.')
    const databasePath = process.env.AKZEM_DATABASE_PATH ?? path.resolve(serverDirectory, '../data/akzem.sqlite')
    mkdirSync(path.dirname(databasePath), { recursive: true })
    sqlite = new DatabaseSync(databasePath)
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','agent')), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)), created_at INTEGER NOT NULL, last_login_at INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at); CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS agent_invitations (id INTEGER PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, token_hash TEXT NOT NULL UNIQUE, created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
      CREATE INDEX IF NOT EXISTS invitations_expiry_idx ON agent_invitations(expires_at);
      CREATE TABLE IF NOT EXISTS commodities (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)), created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS market_observations (id INTEGER PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES users(id), commodity_id INTEGER NOT NULL REFERENCES commodities(id), market_name TEXT NOT NULL, city TEXT NOT NULL, availability TEXT NOT NULL CHECK (availability IN ('available','unavailable')), price_min INTEGER, price_max INTEGER, price_unit TEXT, comment TEXT NOT NULL DEFAULT '', observed_at INTEGER NOT NULL, CHECK ((availability = 'available' AND price_min IS NOT NULL AND price_max IS NOT NULL AND price_min > 0 AND price_max >= price_min) OR (availability = 'unavailable' AND price_min IS NULL AND price_max IS NULL AND price_unit IS NULL)));
      CREATE INDEX IF NOT EXISTS observations_date_idx ON market_observations(observed_at DESC); CREATE INDEX IF NOT EXISTS observations_agent_idx ON market_observations(agent_id, observed_at DESC); CREATE INDEX IF NOT EXISTS observations_commodity_idx ON market_observations(commodity_id, observed_at DESC);
    `)
  }

  for (const name of ['Tomates','Oignons','Pommes de terre','Maïs','Plantain','Manioc','Haricots','Piment','Carottes','Poivrons']) {
    await database.run('INSERT INTO commodities (name, created_at) VALUES (?, ?) ON CONFLICT (name) DO NOTHING', [name, Date.now()])
  }
}

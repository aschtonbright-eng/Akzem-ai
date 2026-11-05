import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { database } from './database.js'

const sessionCookieName = 'akzem.sid'
const sessionLifetimeMs = 8 * 60 * 60 * 1000
const scryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const normalizeEmail = (email) => email.trim().toLowerCase()
const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function hashPassword(password) {
  const salt = randomBytes(16)
  const passwordHash = scryptSync(password, salt, 64, scryptOptions)
  return { salt: salt.toString('base64url'), hash: passwordHash.toString('base64url') }
}

export function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = scryptSync(password, Buffer.from(salt, 'base64url'), 64, scryptOptions)
    const expected = Buffer.from(expectedHash, 'base64url')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch { return false }
}

export async function bootstrapAdminFromEnvironment() {
  const email = process.env.AKZEM_ADMIN_EMAIL?.trim() ?? ''
  const password = process.env.AKZEM_ADMIN_PASSWORD ?? ''
  if (!email && !password) return false
  if (!isValidEmail(email) || password.length < 16) throw new Error('Set a valid AKZEM_ADMIN_EMAIL and an AKZEM_ADMIN_PASSWORD of at least 16 characters.')
  const normalizedEmail = normalizeEmail(email)
  const existing = await database.get('SELECT id, role FROM users WHERE email = ?', [normalizedEmail])
  if (existing && existing.role !== 'admin') throw new Error('AKZEM_ADMIN_EMAIL is already assigned to a collector account; choose a different administrator email.')
  const { salt, hash } = hashPassword(password)
  if (existing) await database.run('UPDATE users SET password_salt = ?, password_hash = ?, is_active = 1 WHERE id = ?', [salt, hash, existing.id])
  else await database.run("INSERT INTO users (email, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)", [normalizedEmail, salt, hash, Date.now()])
  return true
}

export async function hasAdminAccount() {
  return Boolean(await database.get("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1"))
}

export async function issueSession(userId, response) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + sessionLifetimeMs
  await database.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashToken(token), userId, expiresAt])
  response.cookie(sessionCookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: sessionLifetimeMs })
}

export async function clearSession(request, response) {
  const token = readCookie(request, sessionCookieName)
  if (token) await database.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)])
  response.clearCookie(sessionCookieName, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' })
}

function readCookie(request, name) {
  const prefix = `${name}=`
  const part = (request.headers.cookie ?? '').split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix))
  return part ? part.slice(prefix.length) : ''
}

async function getAuthenticatedUser(request) {
  const token = readCookie(request, sessionCookieName)
  if (!token) return null
  const session = await database.get(`
    SELECT users.id, users.email, users.role, users.is_active AS isActive,
      sessions.expires_at AS expiresAt, sessions.token_hash AS tokenHash
    FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?
  `, [hashToken(token)])
  if (!session) return null
  if (!session.isActive || Date.now() >= Number(session.expiresAt)) {
    await database.run('DELETE FROM sessions WHERE token_hash = ?', [session.tokenHash])
    return null
  }
  return { id: session.id, email: session.email, role: session.role }
}

export async function requireUser(request, response, next) {
  const user = await getAuthenticatedUser(request)
  if (!user) return response.status(401).json({ status: 'error', error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } })
  request.user = user
  return next()
}

export function requireRole(role) {
  return async (request, response, next) => {
    const user = await getAuthenticatedUser(request)
    if (!user) return response.status(401).json({ status: 'error', error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } })
    if (user.role !== role) return response.status(403).json({ status: 'error', error: { code: 'FORBIDDEN', message: 'You do not have access to this page.' } })
    request.user = user
    return next()
  }
}

export async function findUserByEmail(email) {
  return database.get('SELECT id, email, password_salt AS passwordSalt, password_hash AS passwordHash, role, is_active AS isActive FROM users WHERE email = ?', [normalizeEmail(email)])
}

export function normalizeUserEmail(email) { return normalizeEmail(email) }
export function hashOpaqueToken(token) { return hashToken(token) }

setInterval(() => {
  database.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]).catch(() => {})
  database.run('DELETE FROM agent_invitations WHERE expires_at <= ? OR used_at IS NOT NULL', [Date.now()]).catch(() => {})
}, 60 * 60 * 1000).unref()

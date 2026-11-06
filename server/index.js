import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { database, initializeDatabase } from './database.js'
import {
  bootstrapAdminFromEnvironment,
  clearSession,
  findUserByEmail,
  hasAdminAccount,
  hashOpaqueToken,
  hashPassword,
  isValidEmail,
  issueSession,
  normalizeUserEmail,
  requireRole,
  requireUser,
  verifyPassword,
} from './security.js'

const app = express()
const port = Number.parseInt(process.env.PORT ?? '3001', 10)
const databaseReady = initializeDatabase().then(bootstrapAdminFromEnvironment)
const apiWindowMs = 60_000
const apiRequestLimit = 30
const requestsByIp = new Map()
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.resolve(currentDirectory, '../dist')
const adminOnly = requireRole('admin')
const agentOnly = requireRole('agent')

setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of requestsByIp) {
    if (now >= entry.resetAt) requestsByIp.delete(ip)
  }
}, apiWindowMs).unref()

app.disable('x-powered-by')
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Cache-Control', 'no-store')
  next()
})
app.use(express.json({ limit: '16kb', strict: true }))
app.use(async (_request, response, next) => { try { await databaseReady; next() } catch (error) { console.error('Database initialization failed:', error instanceof Error ? error.message : 'Unknown error'); response.status(503).json({ status: 'error', error: { code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unavailable.' } }) } })

// Starter single-process rate limit. Use a shared store before scaling to multiple API instances.
app.use('/api', (request, response, next) => {
  const now = Date.now()
  const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown'
  const entry = requestsByIp.get(ip)
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + apiWindowMs
    requestsByIp.set(ip, { count: 1, resetAt })
    response.setHeader('RateLimit-Limit', String(apiRequestLimit))
    response.setHeader('RateLimit-Remaining', String(apiRequestLimit - 1))
    response.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
    return next()
  }

  entry.count += 1
  response.setHeader('RateLimit-Limit', String(apiRequestLimit))
  response.setHeader('RateLimit-Remaining', String(Math.max(0, apiRequestLimit - entry.count)))
  response.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))
  if (entry.count > apiRequestLimit) {
    return response.status(429).json({ status: 'error', error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } })
  }
  next()
})

const sendError = (response, status, code, message) => response.status(status).json({
  status: 'error',
  error: { code, message },
})

const getBodyObject = (body) => body && typeof body === 'object' && !Array.isArray(body)
const cleanText = (value) => typeof value === 'string' ? value.trim() : ''
const priceUnits = new Set(['kg', 'tas', 'sac', 'panier', 'botte', 'tas de 5', 'autre'])

app.get('/api/auth/status', async (_request, response) => {
  response.json({ status: 'success', adminConfigured: await hasAdminAccount() })
})

app.get('/api/auth/me', requireUser, async (request, response) => {
  response.json({ status: 'success', user: request.user })
})

app.post('/api/auth/login', async (request, response) => {
  const { email, password, area } = request.body ?? {}
  if (!getBodyObject(request.body) || !isValidEmail(email) || typeof password !== 'string' || password.length > 256 || !['admin', 'agent'].includes(area)) {
    return sendError(response, 400, 'INVALID_REQUEST', 'Enter a valid email and password.')
  }

  if (area === 'admin' && !(await hasAdminAccount())) {
    return sendError(response, 503, 'ADMIN_NOT_CONFIGURED', 'Configure AKZEM_ADMIN_EMAIL and AKZEM_ADMIN_PASSWORD in .env before admin sign-in.')
  }

  const user = await findUserByEmail(email)
  if (!user || !user.isActive || user.role !== area || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return sendError(response, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
  }

  await database.run('UPDATE users SET last_login_at = ? WHERE id = ?', Date.now(), user.id)
  await issueSession(user.id, response)
  return response.json({ status: 'success', user: { id: user.id, email: user.email, role: user.role } })
})

app.post('/api/auth/logout', async (request, response) => {
  await clearSession(request, response)
  response.json({ status: 'success' })
})

app.post('/api/admin/invitations', adminOnly, async (request, response) => {
  const email = cleanText(request.body?.email)
  if (!isValidEmail(email)) return sendError(response, 400, 'INVALID_EMAIL', 'Enter a valid email address.')

  const normalizedEmail = normalizeUserEmail(email)
  const existingUser = await database.get('SELECT id FROM users WHERE email = ?', normalizedEmail)
  if (existingUser) return sendError(response, 409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.')

  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000
  await database.run('DELETE FROM agent_invitations WHERE email = ? COLLATE NOCASE AND used_at IS NULL', normalizedEmail)
  await database.run(`
    INSERT INTO agent_invitations (email, token_hash, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `, normalizedEmail, hashOpaqueToken(token), request.user.id, now, expiresAt)

  const baseUrl = process.env.APP_BASE_URL?.trim() || `${request.protocol}://${request.get('host')}`
  let inviteUrl
  try {
    const url = new URL('/collect', baseUrl)
    url.searchParams.set('invite', token)
    inviteUrl = url.toString()
  } catch {
    return sendError(response, 500, 'APP_URL_INVALID', 'Set a valid APP_BASE_URL in .env before creating invitations.')
  }

  return response.status(201).json({ status: 'success', invitation: { email: normalizedEmail, inviteUrl, expiresAt } })
})

app.get('/api/collector/invitations/:token', async (request, response) => {
  const token = request.params.token
  if (!/^[a-zA-Z0-9_-]{40,60}$/.test(token)) return sendError(response, 404, 'INVITATION_NOT_FOUND', 'This invitation is invalid or expired.')
  const invitation = await database.get(`
    SELECT email, expires_at AS expiresAt
    FROM agent_invitations
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
  `, hashOpaqueToken(token), Date.now())
  if (!invitation) return sendError(response, 404, 'INVITATION_NOT_FOUND', 'This invitation is invalid or expired.')
  response.json({ status: 'success', invitation })
})

app.post('/api/collector/accept-invitation', async (request, response) => {
  const { token, password } = request.body ?? {}
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{40,60}$/.test(token) || typeof password !== 'string' || password.length < 12 || password.length > 256) {
    return sendError(response, 400, 'INVALID_REQUEST', 'Use the invitation link and choose a password with at least 12 characters.')
  }

  const invitation = await database.get(`
    SELECT id, email FROM agent_invitations
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
  `, hashOpaqueToken(token), Date.now())
  if (!invitation) return sendError(response, 410, 'INVITATION_EXPIRED', 'This invitation is invalid, expired, or already used. Ask an Akzem administrator for a new link.')
  if (await database.get('SELECT id FROM users WHERE email = ?', invitation.email)) {
    return sendError(response, 409, 'EMAIL_ALREADY_REGISTERED', 'This email already has an account. Sign in instead.')
  }

  const { salt, hash } = hashPassword(password)
  const now = Date.now()
  try {
    const userId = await database.transaction(async (tx) => {
      const result = await tx.run(`
        INSERT INTO users (email, password_salt, password_hash, role, created_at)
        VALUES (?, ?, ?, 'agent', ?)
      `, [invitation.email, salt, hash, now])
      const consumed = await tx.run('UPDATE agent_invitations SET used_at = ? WHERE id = ? AND used_at IS NULL', [now, invitation.id])
      if (consumed.changes !== 1) throw new Error('Invitation was already used.')
      return Number(result.lastInsertRowid)
    })
    await issueSession(userId, response)
    return response.status(201).json({ status: 'success', user: { id: userId, email: invitation.email, role: 'agent' } })
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed') || error?.code === '23505') return sendError(response, 409, 'EMAIL_ALREADY_REGISTERED', 'This email already has an account. Sign in instead.')
    console.error('Could not accept collector invitation:', error instanceof Error ? error.message : 'Unknown error')
    return sendError(response, 500, 'INVITATION_SETUP_FAILED', 'The account could not be created. Please request a new invitation.')
  }
})

app.get('/api/collector/commodities', agentOnly, async (_request, response) => {
  const commodities = await database.all('SELECT id, name FROM commodities WHERE is_active = 1 ORDER BY name COLLATE NOCASE')
  response.json({ status: 'success', commodities })
})

app.post('/api/collector/observations', agentOnly, async (request, response) => {
  const body = request.body
  if (!getBodyObject(body)) return sendError(response, 400, 'INVALID_REQUEST', 'Submit a valid price report.')

  const commodityId = Number(body.commodityId)
  const marketName = cleanText(body.marketName)
  const city = cleanText(body.city)
  const availability = body.availability
  const comment = cleanText(body.comment ?? '')
  if (!Number.isSafeInteger(commodityId) || marketName.length < 2 || marketName.length > 120 || city.length < 2 || city.length > 100) {
    return sendError(response, 400, 'INVALID_LOCATION_OR_PRODUCT', 'Choose a product and enter the market name and city.')
  }
  if (!['available', 'unavailable'].includes(availability)) return sendError(response, 400, 'INVALID_AVAILABILITY', 'Choose whether the product is available at this market.')
  if (comment.length > 1000) return sendError(response, 400, 'COMMENT_TOO_LONG', 'Comments must be 1,000 characters or fewer.')

  const commodity = await database.get('SELECT id FROM commodities WHERE id = ? AND is_active = 1', commodityId)
  if (!commodity) return sendError(response, 400, 'PRODUCT_UNAVAILABLE', 'This product is no longer on the active list.')

  let priceMin = null
  let priceMax = null
  let priceUnit = null
  if (availability === 'available') {
    priceMin = Number(body.priceMin)
    priceMax = body.priceMax === '' || body.priceMax === null || body.priceMax === undefined ? priceMin : Number(body.priceMax)
    priceUnit = cleanText(body.priceUnit)
    if (!Number.isSafeInteger(priceMin) || priceMin < 1 || priceMin > 10_000_000
      || !Number.isSafeInteger(priceMax) || priceMax < priceMin || priceMax > 10_000_000
      || !priceUnits.has(priceUnit)) {
      return sendError(response, 400, 'INVALID_PRICE', 'Enter a valid price range and price unit.')
    }
  }

  const observedAt = Date.now()
  const result = await database.run(`
    INSERT INTO market_observations
      (agent_id, commodity_id, market_name, city, availability, price_min, price_max, price_unit, comment, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, request.user.id, commodityId, marketName, city, availability, priceMin, priceMax, priceUnit, comment, observedAt)

  response.status(201).json({ status: 'success', observation: { id: Number(result.lastInsertRowid), observedAt } })
})

app.get('/api/admin/collectors', adminOnly, async (_request, response) => {
  const collectors = await database.all(`
    SELECT id, email, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt
    FROM users WHERE role = 'agent' ORDER BY created_at DESC
  `)
  const invitations = await database.all(`
    SELECT email, created_at AS createdAt, expires_at AS expiresAt
    FROM agent_invitations WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC
  `, Date.now())
  response.json({ status: 'success', collectors, invitations })
})

app.patch('/api/admin/collectors/:id', adminOnly, async (request, response) => {
  const id = Number(request.params.id)
  const isActive = request.body?.isActive
  if (!Number.isSafeInteger(id) || typeof isActive !== 'boolean') return sendError(response, 400, 'INVALID_REQUEST', 'Choose whether this collector account is active.')
  const result = await database.run("UPDATE users SET is_active = ? WHERE id = ? AND role = 'agent'", isActive ? 1 : 0, id)
  if (!result.changes) return sendError(response, 404, 'COLLECTOR_NOT_FOUND', 'Collector account not found.')
  if (!isActive) await database.run('DELETE FROM sessions WHERE user_id = ?', id)
  response.json({ status: 'success' })
})

app.get('/api/admin/commodities', adminOnly, async (_request, response) => {
  const commodities = await database.all('SELECT id, name, is_active AS isActive FROM commodities ORDER BY name COLLATE NOCASE')
  response.json({ status: 'success', commodities })
})

app.post('/api/admin/commodities', adminOnly, async (request, response) => {
  const name = cleanText(request.body?.name)
  if (name.length < 2 || name.length > 80) return sendError(response, 400, 'INVALID_PRODUCT', 'Product names must have between 2 and 80 characters.')
  try {
    const result = await database.run('INSERT INTO commodities (name, created_at) VALUES (?, ?)', name, Date.now())
    response.status(201).json({ status: 'success', commodity: { id: Number(result.lastInsertRowid), name, isActive: true } })
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed') || error?.code === '23505') return sendError(response, 409, 'PRODUCT_EXISTS', 'This product is already on the list.')
    throw error
  }
})

app.patch('/api/admin/commodities/:id', adminOnly, async (request, response) => {
  const id = Number(request.params.id)
  const isActive = request.body?.isActive
  if (!Number.isSafeInteger(id) || typeof isActive !== 'boolean') return sendError(response, 400, 'INVALID_REQUEST', 'Choose whether this product is active.')
  const result = await database.run('UPDATE commodities SET is_active = ? WHERE id = ?', isActive ? 1 : 0, id)
  if (!result.changes) return sendError(response, 404, 'PRODUCT_NOT_FOUND', 'Product not found.')
  response.json({ status: 'success' })
})

app.get('/api/admin/market-observations', adminOnly, async (_request, response) => {
  const observations = await database.all(`
    SELECT observations.id, observations.market_name AS marketName, observations.city,
      observations.availability, observations.price_min AS priceMin, observations.price_max AS priceMax,
      observations.price_unit AS priceUnit, observations.comment, observations.observed_at AS observedAt,
      commodities.name AS commodity, users.email AS agentEmail
    FROM market_observations AS observations
    JOIN commodities ON commodities.id = observations.commodity_id
    JOIN users ON users.id = observations.agent_id
    ORDER BY observations.observed_at DESC
    LIMIT 300
  `)
  response.json({ status: 'success', observations })
})

async function processWithAi({ query, context }) {
  const apiKey = process.env.OPENAI_API_KEY
  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? 'gpt-6-luna'

  if (!apiKey) {
    return {
      answer: `Votre demande a bien été reçue : « ${query.slice(0, 240)}${query.length > 240 ? '…' : ''} ». Le moteur IA Akzem n’est pas encore configuré. Ajoutez OPENAI_API_KEY côté serveur pour obtenir une analyse personnalisée. En attendant, vérifiez les conseils agronomiques auprès d’un spécialiste local.`,
      provider: 'mock',
      model: 'offline-placeholder',
      mode: 'mock',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const providerResponse = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'none' },
        input: [
          { role: 'developer', content: 'You are Akzem Intelligence, an agricultural decision-support assistant for farmers in Cameroon. Respond in French unless the user writes in another language. Give concise, practical guidance. Do not invent local prices, weather, or facts not included in the user context. State uncertainty and recommend local expert advice for high-impact decisions.' },
          ...(context ? [{ role: 'user', content: `Contexte agricole fourni par l’utilisateur (non vérifié) : ${context}` }] : []),
          { role: 'user', content: query },
        ],
      }),
      signal: controller.signal,
    })
    if (!providerResponse.ok) throw new Error(`AI provider returned HTTP ${providerResponse.status}`)
    const payload = await providerResponse.json()
    const answer = Array.isArray(payload?.output)
      ? payload.output
        .filter((item) => item?.type === 'message' && item?.role === 'assistant')
        .flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n')
      : ''
    if (!answer.trim()) throw new Error('AI provider returned no answer')
    return { answer: answer.trim(), provider: new URL(baseUrl).host, model, mode: 'live' }
  } finally {
    clearTimeout(timeout)
  }
}

app.post('/api/akzem-intelligence/query', adminOnly, async (request, response) => {
  const body = request.body
  if (!getBodyObject(body)) return sendError(response, 400, 'INVALID_REQUEST', 'Request body must be a JSON object.')
  let query
  if (typeof body.query === 'string') query = body.query.trim()
  else if (typeof body.input === 'string') query = body.input.trim()
  else if (getBodyObject(body.input)) query = JSON.stringify(body.input)
  else return sendError(response, 400, 'INVALID_REQUEST', 'Provide a non-empty query or input payload.')
  if (!query || query.length > 4000) return sendError(response, 400, 'INVALID_REQUEST', 'Query must contain 1 to 4,000 characters.')
  let context
  if (body.context !== undefined) {
    if (!getBodyObject(body.context)) return sendError(response, 400, 'INVALID_CONTEXT', 'Context must be a JSON object.')
    context = JSON.stringify(body.context)
    if (context.length > 4000) return sendError(response, 400, 'INVALID_CONTEXT', 'Context must be 4,000 characters or fewer.')
  }

  try {
    const result = await processWithAi({ query, context })
    response.json({ status: 'success', result: { answer: result.answer }, timestamp: new Date().toISOString(), metadata: { provider: result.provider, model: result.model, mode: result.mode } })
  } catch (error) {
    console.error('AI request failed:', error instanceof Error ? error.message : 'Unknown error')
    sendError(response, 502, 'AI_PROVIDER_ERROR', 'The AI service could not complete the request.')
  }
})

app.get('/api/health', async (_request, response) => response.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use('/api', (_request, response) => sendError(response, 404, 'NOT_FOUND', 'API route not found.'))

app.use((error, _request, response, _next) => {
  if (error?.type === 'entity.too.large') return sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Request body must be 16 KB or smaller.')
  if (error instanceof SyntaxError && 'body' in error) return sendError(response, 400, 'INVALID_JSON', 'Request body must contain valid JSON.')
  console.error('Unhandled request error:', error instanceof Error ? error.message : 'Unknown error')
  return sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.')
})

if (existsSync(distDirectory) && !process.env.VERCEL) {
  app.use(express.static(distDirectory, { index: false, maxAge: '1h' }))
  app.get(/.*/, (_request, response) => response.sendFile(path.join(distDirectory, 'index.html')))
}

if (!process.env.VERCEL) { await databaseReady; app.listen(port, () => console.log(`Akzem Intelligence listening on port ${port}`)) }

export default app

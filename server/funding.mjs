import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { address, networks, initEccLib } from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'

initEccLib(ecc)
const CURRENCIES = ['auto', 'usd', 'gbp', 'eur']
const METHODS = ['bank', 'card', 'any']
const MAX_BODY_BYTES = 4096
const MAX_BITCOIN_PURCHASE = 100000 // Integration limit; provider limits may be lower.

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders,
  } })
}

export function canonicalizeIp(value) {
  if (typeof value !== 'string' || !isIP(value)) throw new Error('Invalid client IP')
  if (isIP(value) === 4) return value
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical)
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
    return [high >> 8, high & 255, low >> 8, low & 255].join('.')
  }
  return canonical
}

export function signWidgetUrl(url, secret) {
  const signature = createHmac('sha256', secret).update(new URL(url).search).digest('base64')
  return `${url}&signature=${encodeURIComponent(signature)}`
}

function configFromEnv(env) {
  const environment = env.MOONPAY_ENV || 'sandbox'
  if (!['sandbox', 'production'].includes(environment)) throw new Error('Invalid MOONPAY_ENV')
  const origins = (env.FUNDING_ALLOWED_ORIGINS || 'https://onecurrency.net,https://www.onecurrency.net').split(',').map(v => v.trim())
  for (const value of origins) {
    const url = new URL(value)
    if (url.origin !== value || url.protocol !== 'https:') throw new Error('Funding origins must be HTTPS origins')
  }
  const keyMode = environment === 'production' ? 'live' : 'test'
  const apiKey = env.MOONPAY_PUBLISHABLE_KEY || ''
  const secret = env.MOONPAY_SECRET_KEY || ''
  const hasKeys = apiKey.startsWith(`pk_${keyMode}_`) && secret.startsWith(`sk_${keyMode}_`)
  const enabled = env.FUNDING_ENABLED === 'true' && hasKeys && (environment !== 'production' || env.FUNDING_LIVE_ENABLED === 'true')
  return { environment, origins, apiKey, secret, enabled }
}

function validatePurchase(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid purchase request')
  const fields = ['address', 'network', 'currency', 'amount', 'method', 'consent']
  if (Object.keys(body).some(key => !fields.includes(key))) throw new Error('Unexpected purchase field')
  if (body.network !== 'mainnet') throw new Error('Purchases require a Bitcoin mainnet wallet')
  if (body.consent !== true) throw new Error('Confirm the destination and checkout disclosure')
  if (!CURRENCIES.includes(body.currency)) throw new Error('Unsupported currency')
  if (!METHODS.includes(body.method)) throw new Error('Unsupported payment method')
  if (body.currency === 'auto' ? body.amount !== null : (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > MAX_BITCOIN_PURCHASE)) {
    throw new Error('Enter a whole currency amount between 1 and 100,000')
  }
  if (typeof body.address !== 'string' || body.address.length > 100 || body.address !== body.address.trim()) throw new Error('Invalid Bitcoin address')
  let destination = body.address
  if (/^bc1/i.test(destination) && destination === destination.toUpperCase()) destination = destination.toLowerCase()
  try { address.toOutputScript(destination, networks.bitcoin) } catch { throw new Error('Invalid Bitcoin mainnet address') }
  return { ...body, address: destination }
}

function purchaseUrl(config, purchase, origin, clientIp) {
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    currencyCode: 'btc',
    walletAddress: purchase.address,
    showWalletAddressForm: 'true',
    redirectURL: `${origin}/?funding=return`,
    theme: 'dark',
    allowedIpAddress: createHmac('sha256', config.secret).update(clientIp).digest('base64'),
  })
  if (purchase.currency !== 'auto') {
    params.set('baseCurrencyCode', purchase.currency)
    params.set('baseCurrencyAmount', String(purchase.amount))
    params.set('lockAmount', 'true')
  }
  // USD bank funding uses the provider's Balance flow, which handles Plaid linking.
  // If unavailable, MoonPay displays its eligible payment choices.
  if (purchase.method === 'card') params.set('paymentMethod', 'credit_debit_card')
  if (purchase.method === 'bank' && purchase.currency !== 'auto') params.set('paymentMethod', {
    usd: 'moonpay_balance', gbp: 'gbp_open_banking_payment', eur: 'sepa_bank_transfer',
  }[purchase.currency])
  const host = config.environment === 'production' ? 'https://buy.moonpay.com/' : 'https://buy-sandbox.moonpay.com/'
  return signWidgetUrl(`${host}?${params}`, config.secret)
}

// A checkout URL grants no access to wallet keys or bank accounts. Authentication,
// payment consent, identity checks and purchase execution remain with MoonPay.
export function createFundingHandler({ env = process.env, now = Date.now } = {}) {
  const config = configFromEnv(env)
  const requests = new Map()
  function rateLimited(ip) {
    const time = now()
    for (const [key, value] of requests) if (value.resetAt <= time) requests.delete(key)
    if (!requests.has(ip)) {
      if (requests.size >= 10000) return true
      requests.set(ip, { count: 0, resetAt: time + 60000 })
    }
    const entry = requests.get(ip)
    entry.count++
    return entry.count > 10
  }
  return async function handle(request, { clientIp } = {}) {
    const path = new URL(request.url).pathname
    if (path === '/api/funding/config') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' })
      return json({ enabled: config.enabled, provider: 'moonpay', environment: config.environment, currencies: CURRENCIES })
    }
    if (path !== '/api/funding/checkout') return json({ error: 'Not found' }, 404)
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' })
    const origin = request.headers.get('origin')
    if (!config.origins.includes(origin)) return json({ error: 'Request origin not allowed' }, 403)
    if (!config.enabled) return json({ error: 'Bank and card purchases are not available yet' }, 503)
    let ip
    try { ip = canonicalizeIp(clientIp) } catch { return json({ error: 'Unable to verify your connection. Please try again later.' }, 503) }
    if (rateLimited(ip)) return json({ error: 'Too many checkout requests. Try again in a minute.' }, 429, { 'Retry-After': '60' })
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'JSON request required' }, 415)
    let body
    try {
      const text = await request.text()
      if (Buffer.byteLength(text) > MAX_BODY_BYTES) return json({ error: 'Request too large' }, 413)
      body = JSON.parse(text)
    } catch { return json({ error: 'Invalid JSON request' }, 400) }
    let purchase
    try { purchase = validatePurchase(body) } catch (error) { return json({ error: error.message }, 400) }
    return json({ url: purchaseUrl(config, purchase, origin, ip), environment: config.environment })
  }
}

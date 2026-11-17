import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { address as bitcoinAddress } from 'bitcoinjs-lib'
import { canonicalizeIp, createFundingHandler, signWidgetUrl } from '../server/funding.mjs'

const env = { FUNDING_ENABLED: 'true', MOONPAY_PUBLISHABLE_KEY: 'pk_test_example', MOONPAY_SECRET_KEY: 'sk_test_example' }
const destination = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
const purchase = { address: destination, network: 'mainnet', amount: 100, currency: 'usd', method: 'card', consent: true }
const context = { clientIp: '203.0.113.42' }
const request = (body = purchase, overrides = {}) => new Request('https://onecurrency.net/api/funding/checkout', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://onecurrency.net' }, body: JSON.stringify(body), ...overrides,
})

test('signatures match the official MoonPay test vector including reserved characters', () => {
  const url = 'https://buy-sandbox.moonpay.com/?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe'
  assert.equal(signWidgetUrl(url, 'sk_test_DocsVector00'), url + '&signature=oIJxSghyzll%2FBLhUFdQZhkxf7DAS8REFaWr%2FibO%2BK8Q%3D')
})

test('funding is disabled without correctly matched keys and an explicit live switch', async () => {
  for (const value of [{}, { ...env, FUNDING_ENABLED: 'false' }, { ...env, MOONPAY_ENV: 'production' }, {
    ...env, MOONPAY_ENV: 'production', MOONPAY_PUBLISHABLE_KEY: 'pk_live_example', MOONPAY_SECRET_KEY: 'sk_live_example',
  }]) {
    const handler = createFundingHandler({ env: value })
    const config = await handler(new Request('https://onecurrency.net/api/funding/config'))
    assert.equal((await config.json()).enabled, false)
    assert.equal((await handler(request(), context)).status, 503)
  }
})

test('config exposes capability and environment but no keys', async () => {
  const response = await createFundingHandler({ env })(new Request('https://onecurrency.net/api/funding/config'))
  assert.deepEqual(await response.json(), { enabled: true, provider: 'moonpay', environment: 'sandbox', currencies: ['auto', 'usd', 'gbp', 'eur'] })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('signed checkout pins Bitcoin, destination, amount, client IP and trusted return origin', async () => {
  const response = await createFundingHandler({ env })(request(), context)
  assert.equal(response.status, 200)
  const body = await response.json()
  const url = new URL(body.url)
  assert.equal(url.origin, 'https://buy-sandbox.moonpay.com')
  assert.equal(url.searchParams.get('currencyCode'), 'btc')
  assert.equal(url.searchParams.get('walletAddress'), destination)
  assert.equal(url.searchParams.get('baseCurrencyAmount'), '100')
  assert.equal(url.searchParams.get('lockAmount'), 'true')
  assert.equal(url.searchParams.get('showWalletAddressForm'), 'true')
  assert.equal(url.searchParams.get('paymentMethod'), 'credit_debit_card')
  assert.equal(url.searchParams.get('redirectURL'), 'https://onecurrency.net/?funding=return')
  assert.equal(url.searchParams.get('allowedIpAddress'), createHmac('sha256', env.MOONPAY_SECRET_KEY).update(context.clientIp).digest('base64'))
  const signature = url.searchParams.get('signature')
  url.searchParams.delete('signature')
  assert.equal(signature, createHmac('sha256', env.MOONPAY_SECRET_KEY).update(url.search).digest('base64'))
  assert.equal(body.url.includes(env.MOONPAY_SECRET_KEY), false)
  // This endpoint only prepares checkout. No bank transfer, wallet balance or success flag.
  assert.deepEqual(Object.keys(body).sort(), ['environment', 'url'])
})

test('explicit production configuration uses only the production host', async () => {
  const handler = createFundingHandler({ env: { ...env, MOONPAY_ENV: 'production', FUNDING_LIVE_ENABLED: 'true',
    MOONPAY_PUBLISHABLE_KEY: 'pk_live_example', MOONPAY_SECRET_KEY: 'sk_live_example' } })
  const body = await (await handler(request(), context)).json()
  assert.equal(new URL(body.url).origin, 'https://buy.moonpay.com')
})

test('bank preferences use the documented regional payment methods', async () => {
  for (const [currency, expected] of [['usd', 'moonpay_balance'], ['eur', 'sepa_bank_transfer'], ['gbp', 'gbp_open_banking_payment']]) {
    const response = await createFundingHandler({ env })(request({ ...purchase, method: 'bank', currency }), context)
    assert.equal(new URL((await response.json()).url).searchParams.get('paymentMethod'), expected)
  }
})

test('automatic currency leaves amount and payment selection to the provider for global coverage', async () => {
  const response = await createFundingHandler({ env })(request({ ...purchase, currency: 'auto', amount: null, method: 'bank' }), context)
  const url = new URL((await response.json()).url)
  for (const key of ['baseCurrencyCode', 'baseCurrencyAmount', 'lockAmount', 'paymentMethod']) assert.equal(url.searchParams.has(key), false)
})

test('reject wrong networks, bad checksums, malformed amounts and parameter injection', async () => {
  for (const override of [
    { network: 'testnet' }, { network: undefined }, { address: 'tb1qanything' }, { address: destination.slice(0, -1) + 'b' },
    { address: 'https://evil.example' }, { address: ' ' + destination }, { amount: -1 }, { amount: 0 }, { amount: 0.5 },
    { amount: '100' }, { amount: null }, { amount: 100001 }, { amount: Number.MAX_SAFE_INTEGER },
    { currency: 'evil' }, { currency: 'auto', amount: 100 }, { method: 'cash' }, { consent: false }, { consent: 'true' },
    { url: 'https://evil.example' }, { redirectURL: 'https://evil.example' }, { currencyCode: 'eth' },
  ]) {
    const response = await createFundingHandler({ env })(request({ ...purchase, ...override }), context)
    assert.equal(response.status, 400, JSON.stringify(override))
    assert.equal(Object.hasOwn(await response.json(), 'url'), false)
  }
})

test('accepts legacy, SegWit and Taproot mainnet destinations with case normalization', async () => {
  for (const address of [destination, bitcoinAddress.toBech32(Buffer.alloc(20, 1), 0, 'bc'), bitcoinAddress.toBech32(Buffer.alloc(32, 1), 1, 'bc').toUpperCase()]) {
    const response = await createFundingHandler({ env })(request({ ...purchase, address }), context)
    assert.equal(response.status, 200)
  }
})

test('CSRF, malformed payloads, methods and unverified IPs fail closed', async () => {
  const handler = createFundingHandler({ env })
  assert.equal((await handler(request(purchase, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } }), context)).status, 403)
  assert.equal((await handler(request(purchase, { headers: { 'Content-Type': 'application/json' } }), context)).status, 403)
  assert.equal((await handler(request(purchase, { method: 'GET', body: undefined }), context)).status, 405)
  assert.equal((await handler(request(purchase, { headers: { Origin: 'https://onecurrency.net', 'Content-Type': 'text/plain' } }), context)).status, 415)
  assert.equal((await handler(request(purchase, { body: '{' }), context)).status, 400)
  assert.equal((await handler(request(purchase, { body: ' '.repeat(4097) }), context)).status, 413)
  assert.equal((await handler(request(), {})).status, 503)
  assert.equal((await handler(request(), { clientIp: 'spoofed' })).status, 503)
  assert.equal((await handler(new Request('https://onecurrency.net/api/other'), context)).status, 404)
})

test('canonicalizes IPv6 and IPv4-mapped addresses before IP binding', () => {
  assert.equal(canonicalizeIp('2001:0DB8:0000:0000:0000:0000:0000:0001'), '2001:db8::1')
  assert.equal(canonicalizeIp('::ffff:203.0.113.42'), '203.0.113.42')
  assert.equal(canonicalizeIp('203.0.113.42'), '203.0.113.42')
  for (const invalid of ['203.0.113.042', '203.0.113.42, 127.0.0.1', '', undefined]) assert.throws(() => canonicalizeIp(invalid))
})

test('per-client throttle resets after one minute', async () => {
  let time = 0
  const handler = createFundingHandler({ env, now: () => time })
  for (let i = 0; i < 10; i++) assert.equal((await handler(request(), context)).status, 200)
  const limited = await handler(request(), context)
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '60')
  time = 60001
  assert.equal((await handler(request(), context)).status, 200)
})

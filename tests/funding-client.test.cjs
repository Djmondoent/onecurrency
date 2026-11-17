const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { transformSync } = require('esbuild')
const filename = path.resolve(__dirname, '../src/lib/funding.ts')
const mod = new Module(filename, module)
mod.filename = filename
mod.paths = module.paths
mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename)
const { createFundingCheckout, getFundingConfig } = mod.exports
const originalFetch = global.fetch
const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
const purchase = { address, network: 'mainnet', currency: 'auto', amount: null, method: 'card', consent: true }
const controller = new AbortController()
const checkout = `https://buy-sandbox.moonpay.com/?currencyCode=btc&walletAddress=${address}&signature=test`

test.after(() => { global.fetch = originalFetch })
test('SPA HTML and invalid config do not enable funding', async () => {
  global.fetch = async () => new Response('<html>SPA</html>', { headers: { 'Content-Type': 'text/html' } })
  await assert.rejects(getFundingConfig(controller.signal), /not available/)
  for (const data of [{}, { enabled: 'true', provider: 'moonpay', environment: 'sandbox' }, { enabled: true, provider: 'other', environment: 'production' }]) {
    global.fetch = async () => Response.json(data)
    await assert.rejects(getFundingConfig(controller.signal), /not available/)
  }
})
test('checkout request sends the reviewed purchase to same-origin API without cookies', async () => {
  global.fetch = async (url, init) => {
    assert.equal(url, '/api/funding/checkout')
    assert.equal(init.credentials, 'omit')
    assert.equal(init.cache, 'no-store')
    assert.deepEqual(JSON.parse(init.body), purchase)
    return Response.json({ url: checkout, environment: 'sandbox' })
  }
  assert.equal(await createFundingCheckout(purchase, 'sandbox', controller.signal), checkout)
})
test('refuse wrong host, wallet, asset, environment, missing signature and insecure links', async () => {
  for (const url of [
    checkout.replace('buy-sandbox.moonpay.com', 'evil.example'),
    checkout.replace('https:', 'http:'),
    checkout.replace(address, 'another-wallet'),
    checkout.replace('currencyCode=btc', 'currencyCode=eth'),
    checkout.replace('&signature=test', ''),
    checkout.replace('buy-sandbox.moonpay.com', 'buy.moonpay.com'),
    checkout.replace('buy-sandbox.moonpay.com', 'buy-sandbox.moonpay.com.evil.example'),
  ]) {
    global.fetch = async () => Response.json({ url, environment: 'sandbox' })
    await assert.rejects(createFundingCheckout(purchase, 'sandbox', controller.signal))
  }
  global.fetch = async () => Response.json({ url: checkout, environment: 'production' })
  await assert.rejects(createFundingCheckout(purchase, 'sandbox', controller.signal))
})
test('server unavailability surfaces an actionable error', async () => {
  global.fetch = async () => Response.json({ error: 'Purchases unavailable' }, { status: 503 })
  await assert.rejects(createFundingCheckout(purchase, 'sandbox', controller.signal), /Purchases unavailable/)
})

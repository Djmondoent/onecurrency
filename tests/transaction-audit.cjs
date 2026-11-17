const assert = require('node:assert/strict')
const { buildSync } = require('esbuild')
const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')
const bitcoin = require('bitcoinjs-lib')
let checks = 0
async function main() {
  for (const [file, network, other] of [
    ['wallet.ts', bitcoin.networks.testnet, bitcoin.networks.bitcoin],
    ['wallet.mainnet.ts', bitcoin.networks.bitcoin, bitcoin.networks.testnet],
  ]) {
    const entry = path.resolve(__dirname, '../src/lib', file)
    const result = buildSync({ stdin: { contents: fs.readFileSync(entry, 'utf8') + '\nexport { findChildForAddress as auditFindChild }', resolveDir: path.dirname(entry), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false })
    const mod = new Module(entry, module)
    mod.filename = entry
    mod.paths = module.paths
    mod._compile(result.outputFiles[0].text, entry)
    const wallet = mod.exports
    const pubkey = Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex')
    const makeAddresses = net => [
      bitcoin.payments.p2pkh({ pubkey, network: net }).address,
      bitcoin.payments.p2sh({ redeem: bitcoin.payments.p2wpkh({ pubkey, network: net }), network: net }).address,
      bitcoin.payments.p2wpkh({ pubkey, network: net }).address,
    ]
    const addresses = makeAddresses(network)
    for (const addr of addresses) {
      assert.equal(wallet.isValidAddress(addr), true); checks++
      const bad = addr.slice(0, -1) + (addr.endsWith('q') ? 'p' : 'q')
      assert.equal(wallet.isValidAddress(bad), false); checks++
    }
    for (const addr of [...makeAddresses(other), '', 'bc1qgarbage', 'tb1qgarbage']) {
      assert.equal(wallet.isValidAddress(addr), false); checks++
    }
    const witness = network === bitcoin.networks.bitcoin ? 'bc' : 'tb'
    const taproot = bitcoin.address.toBech32(Buffer.alloc(32, 1), 1, witness)
    assert.equal(wallet.isValidAddress(taproot), true); checks++
    assert.equal(wallet.isValidAddress(addresses[2].toUpperCase()), true); checks++
    assert.equal(wallet.isValidAddress(addresses[2].slice(0, 4).toUpperCase() + addresses[2].slice(4)), false); checks++
    await assert.rejects(wallet.auditFindChild('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', addresses[2], 2), /No wallet key found/); checks++
    for (const fn of [wallet.buildAndBroadcastMulti, wallet.buildUnsignedPsbtMulti]) {
      for (const [targets, fee] of [
        [[], 1],
        [[{address: addresses[2], value: 1}], NaN],
        [[{address: addresses[2], value: 1}], Infinity],
        [[{address: addresses[2], value: 1}], -1],
        [[{address: addresses[2], value: 0.5}], 1],
        [[{address: addresses[2], value: -1}], 1],
        [[{address: addresses[2], value: 2100000000000001}], 1],
        [[{address: makeAddresses(other)[2], value: 1000}], 1],
      ]) {
        await assert.rejects(fn(addresses[2], targets, fee)); checks++
      }
    }
  }
  console.log(`${checks} transaction regression checks passed; no network calls or broadcasts`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })

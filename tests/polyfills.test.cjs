const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const source = transformSync(fs.readFileSync(path.resolve(__dirname, '../src/polyfills.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code

function loadPolyfills(PromiseClass) {
  const window = {}
  vm.runInNewContext(source, { window, Promise: PromiseClass, require })
  assert.equal(window.Buffer, Buffer)
  assert.equal(window.global, window)
  return window
}

test('older browsers settle mixed promises in input order without rejecting the aggregate', async () => {
  class BrowserPromise extends Promise {}
  BrowserPromise.allSettled = undefined
  loadPolyfills(BrowserPromise)
  const results = await BrowserPromise.allSettled([Promise.resolve('ok'), Promise.reject('unavailable'), 7])
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [
    { status: 'fulfilled', value: 'ok' },
    { status: 'rejected', reason: 'unavailable' },
    { status: 'fulfilled', value: 7 },
  ])
  assert.equal((await BrowserPromise.allSettled([])).length, 0)
})

test('modern browsers keep their native allSettled implementation', () => {
  const native = Promise.allSettled
  loadPolyfills(Promise)
  assert.equal(Promise.allSettled, native)
})

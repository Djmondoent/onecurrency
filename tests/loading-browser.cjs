// Run with a Linux Electron binary under xvfb-run. Uses isolated, in-memory
// browser sessions, files from dist, and blocks all external requests.
const { app, BrowserWindow, session } = require('electron')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const inputs = process.argv.slice(process.argv.indexOf(__filename) + 1)
const candidate = path.resolve(inputs[1] || path.join(__dirname, '../dist'))
const baseline = inputs[0] && path.resolve(inputs[0])
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('mute-audio')
app.on('window-all-closed', () => {})
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function runScenario(name, directory, fault) {
  const isolated = session.fromPartition('loading-test-' + name + '-' + Date.now())
  isolated.webRequest.onBeforeRequest((request, callback) => {
    callback({ cancel: new URL(request.url).hostname !== 'localhost' })
  })
  await new Promise(resolve => isolated.protocol.interceptBufferProtocol('http', (request, callback) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname)
    if (fault && /\/bootstrapApp-[^/]+\.js$/.test(pathname)) {
      return callback({ mimeType: 'application/javascript', data: Buffer.from(
        fault === 'timeout' ? 'new Promise(function () {});' :
          fault === 'parse' ? 'const = broken;' : 'throw new Error("Simulated app initialization failure")'
      ) })
    }
    const file = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return callback({ error: -6 })
    }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.wav': 'audio/wav' }
    callback({ mimeType: types[path.extname(file)] || 'application/octet-stream', data: fs.readFileSync(file) })
  }, resolve))
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: isolated, nodeIntegration: false } })
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => {
    if (/Uncaught|OneCurrency could not start:|TypeError|ReferenceError|SyntaxError/.test(message)) errors.push(message)
  })
  win.loadURL('http://localhost/').catch(error => errors.push(error.message))
  async function state() {
    return win.webContents.executeJavaScript(`(function () {
      var loader = document.getElementById('app-loader'), root = document.getElementById('root');
      return { loader: !!loader && getComputedStyle(loader).display !== 'none',
        root: !!root && !root.hidden && root.children.length > 0,
        text: root ? root.innerText.slice(0, 350) : '',
        retry: !!document.getElementById('app-retry'),
        message: loader ? loader.innerText : '' };
    })()`)
  }
  let current
  const deadline = Date.now() + (fault === 'timeout' ? 24000 : 12000)
  do {
    await pause(150)
    current = await state()
    if (fault ? current.retry : current.root && !current.loader) break
    if (name.endsWith('baseline') && errors.length) break
  } while (Date.now() < deadline)
  console.log(JSON.stringify({ scenario: name, observed: current, errors: errors }))
  if (name.endsWith('baseline')) {
    assert(current.loader && !current.root, 'baseline must reproduce the stuck loading screen')
    const expected = name === 'buffer-baseline' ? /Buffer is not defined/ : /Unexpected token/
    assert(errors.some(error => expected.test(error)), 'baseline must reproduce the expected startup failure')
  } else if (fault) {
    assert(current.loader && current.retry && !current.root, name + ': show a usable recovery screen')
    assert(/Unable to start OneCurrency/.test(current.message), name + ': show the startup failure')
  } else {
    assert(current.root && !current.loader, 'app must mount and hide the loading screen')
    assert.strictEqual(errors.length, 0, 'app must have no startup errors: ' + errors.join('; '))
    await win.webContents.executeJavaScript(`(function () {
      localStorage.setItem('loading-test-wallet-sentinel', 'keep');
      var button = Array.from(document.querySelectorAll('button')).find(function (item) { return item.textContent === 'Dev/Testnet'; });
      if (!button) throw new Error('Network switch is missing');
      button.click();
    })()`)
    await pause(1500)
    const switched = await state()
    assert(switched.root && !switched.loader, 'testnet must render')
    assert.strictEqual(errors.length, 0, 'network switch must not throw: ' + errors.join('; '))
    await win.reload()
    await pause(2500)
    const reloaded = await state()
    assert(reloaded.root && !reloaded.loader, 'saved network preference must survive reload')
    assert.strictEqual(await win.webContents.executeJavaScript("localStorage.getItem('loading-test-wallet-sentinel')"), 'keep')
    assert.strictEqual(errors.length, 0, 'reload must not throw: ' + errors.join('; '))
    fs.writeFileSync(path.join(__dirname, '../browser-smoke.png'), (await win.webContents.capturePage()).toPNG())
    current = reloaded
  }
  console.log(JSON.stringify({ scenario: name, pass: true, state: current, errors: errors }))
  win.destroy()
}

app.on('ready', async () => {
  try {
    console.log('Browser versions: ' + JSON.stringify(process.versions))
    console.log('Build directories: ' + JSON.stringify({ baseline, candidate }))
    if (baseline) await runScenario('baseline', baseline)
    if (inputs[2]) await runScenario('buffer-baseline', path.resolve(inputs[2]))
    await runScenario('fixed', candidate)
    await runScenario('module-parse-error', candidate, 'parse')
    await runScenario('module-initialization-error', candidate, 'initialization')
    await runScenario('module-timeout', candidate, 'timeout')
    console.log('All browser scenarios passed')
    app.exit(0)
  } catch (error) {
    console.error(error.stack)
    app.exit(1)
  }
})
setTimeout(() => { console.error('Browser smoke test timed out'); app.exit(1) }, 60000)

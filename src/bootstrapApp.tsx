import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { I18nProvider } from './i18n'
import { applyTheme, getStoredTheme } from './theme'
import { applyStoredWalletStyle } from './walletStyle'
import { initWindowManager } from './windowManager'
import { markAppMounted, showStartupError } from './startup'

class StartupBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { showStartupError(error) }
  render() { return this.state.failed ? null : this.props.children }
}

function StartupReady() {
  React.useEffect(markAppMounted, [])
  return null
}

// Apply saved theme before first paint to avoid flash
try { applyTheme(getStoredTheme()) } catch {}
try { applyStoredWalletStyle() } catch {}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
      <StartupReady />
    </StartupBoundary>
  </React.StrictMode>
)

// Init window controls after first render
setTimeout(() => { try { initWindowManager() } catch {} }, 0)

try {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {})
  }
  if ('caches' in window) {
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('onecurrency-offline')).map((key) => caches.delete(key))))
      .catch(() => {})
  }
  localStorage.removeItem('wallet.offlineMode')
} catch {}

// Expose a lightweight provider bridge for the OneCurrency extension
try {
  (window as any).__ONECURRENCY_AVAILABLE = true
  try { document.documentElement.setAttribute('data-onecurrency', '1') } catch {}
  type Req = { source: 'onecurrency-ext'; id: string; type: string; params?: any }
  type Res = { source: 'onecurrency-app'; id: string; ok: boolean; data?: any; error?: string }

  // Lazy import to avoid upfront cost
  const api = {
    ready: false,
    ensure: async () => {
      if (api.ready) return
      const stor = await import('./lib/storage.mainnet')
      const w = await import('./lib/wallet.mainnet')
      await w.ensureEccInit()
      w.setNetwork(w.Network.Mainnet)
      ;(api as any).stor = stor
      ;(api as any).w = w
      api.ready = true
    },
  } as any

  window.addEventListener('message', async (evt: MessageEvent) => {
    const d = evt.data as Req
    if (!d || d.source !== 'onecurrency-ext') return
    const id = d.id || ''
    const reply = (res: Partial<Res>) => {
      const msg: Res = { source: 'onecurrency-app', id, ok: !!res.ok, data: res.data, error: res.error }
      window.postMessage(msg, '*')
    }
    try {
      await api.ensure()
      const stor = api.stor
      const w = api.w
      if (d.type === 'ping') { reply({ ok: true, data: true }); return }
      if (d.type === 'getNetwork') { reply({ ok: true, data: 'Mainnet' }); return }
      if (d.type === 'getAccounts' || d.type === 'getAddress') {
        const m = stor.getMnemonic()
        if (!m) throw new Error('No wallet found')
        const idx = stor.getAddressIndex()
        const addr = await w.getAddress(m, idx)
        reply({ ok: true, data: [addr] })
        return
      }
      if (d.type === 'getBalance') {
        const m = api.stor.getMnemonic()
        if (!m) throw new Error('No wallet found')
        const idx = api.stor.getAddressIndex()
        const addr = await api.w.getAddress(m, idx)
        const bal = await api.w.getBalance(addr)
        reply({ ok: true, data: bal })
        return
      }
      if (d.type === 'signMessage') {
        // Optional: implement when needed
        throw new Error('signMessage not supported')
      }
      reply({ ok: false, error: 'Unknown request' })
    } catch (e: any) {
      reply({ ok: false, error: e?.message || 'Failed' })
    }
  })
} catch {}

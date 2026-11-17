type WindowState = {
  isOpen: boolean
  isMinimized: boolean
  isMaximized: boolean
  lastFocusEl: HTMLElement | null
}

type HelpEntry = { title: string; body: string }

const windows: Record<string, WindowState> = {}

const helpContent: Record<string, HelpEntry> = {
  walletAddress: { title: 'Your Address', body: 'This is your mainnet Bitcoin address. Share it to receive BTC. Use Copy or Next to rotate addresses.' },
  walletBalance: { title: 'BTC Balance', body: 'Shows your total BTC balance. Toggle Hide to blur it and use sats for smaller units.' },
  recentActivity: { title: 'Recent Activity', body: 'Your latest transactions for this wallet. Incoming is green, outgoing is red.' },
  addressHistory: { title: 'Address History', body: 'Browse older addresses and balances. Use an address again if funds were sent there.' },
  satsConverter: { title: 'Sats', body: 'Sats are Bitcoin cents. 1 BTC = 100,000,000 sats. Use the converter below to check value.' },
  converter: { title: 'Real-time Converter', body: 'Live USD/BTC/sats converter using the latest price feed.' },
  faucet: { title: 'Faucet', body: 'Claim free sats by promoting OneCurrency. Withdraw after you hit the minimum threshold.' },
  faucetBanner: { title: 'Claim free sats', body: 'Open the OneCurrency Faucet to earn small amounts of sats for testing and onboarding.' },
  lookup: { title: 'Address Lookup', body: 'Search any BTC address (mainnet or testnet). Shows balance and transaction history.' },
  send: { title: 'Send', body: 'Send BTC to another address with fee estimates and confirmations.' },
  sendPsbt: { title: 'External Signing', body: 'Create an unsigned PSBT to sign on a hardware or external signer, then broadcast the signed PSBT.' },
  receive: { title: 'Receive', body: 'Show your receiving address and QR code to accept BTC.' },
  backup: { title: 'Backup', body: 'Create or restore encrypted backups for your wallet recovery phrase.' },
  backupRestore: { title: 'Restore Encrypted Backup', body: 'Paste encrypted JSON or scan a QR code to restore a backup using its original password.' },
  settings: { title: 'Settings', body: 'Wallet preferences, security, and connection tools.' },
  settingsRestore: { title: 'Restore Encrypted Backup', body: 'Decrypt and import a backup using its original passphrase.' },
  downloads: { title: 'Downloads', body: 'Download links for OneCurrency apps and installers.' },
  howto: { title: 'How To Use', body: 'Step-by-step guidance for using the wallet features.' },
  unlockWallet: { title: 'Unlock wallet', body: 'Enter your passphrase and choose how long to keep this session unlocked.' },
  forgotPassphrase: { title: 'Forgot passphrase?', body: 'Restore with your recovery words and set a new device passphrase.' },
  restoreEncrypted: { title: 'Restore encrypted backup', body: 'Import an encrypted JSON/QR backup using the original password.' },
  restoreWords: { title: 'Restore with recovery words', body: 'Enter your 12, 20, or 24 words and set a new local passphrase.' },
  startNewWallet: { title: 'Start a new wallet', body: 'Create a fresh wallet on this device after setting a new passphrase.' },
  creditHero: { title: 'Bitcoin Credit Union', body: 'Overview of the credit union offering and quick actions.' },
  creditWhy: { title: 'Why OneCurrency Credit', body: 'Key benefits and how the credit line works.' },
  creditApply: { title: 'Apply for a line of credit', body: 'Submit a request with your details and collateral address.' },
  creditFlow: { title: 'Faucet + Wallet flow', body: 'Start with free sats, grow your stack, and unlock credit options.' },
  credit: { title: 'Credit Union', body: 'Information about the proposed credit union services.' },
  learn: { title: 'Learn', body: 'Quick primers for new users. Open a topic to read the essentials.' },
  'learnTopic-sats': { title: 'Satoshi 101', body: 'Learn how sats relate to BTC and why they are used for small amounts.' },
  'learnTopic-faucet': { title: 'Bitcoin Faucet', body: 'Faucets provide small BTC amounts for practice and onboarding.' },
  'learnTopic-what-bitcoin': { title: 'What is Bitcoin?', body: 'Overview of Bitcoin as open, decentralized digital money.' },
  'learnTopic-what-money': { title: 'What is Money?', body: 'Learn what makes money useful and why scarcity matters.' },
  'learnTopic-mining': { title: 'Bitcoin Mining', body: 'How miners secure the network and earn rewards.' },
  'learnTopic-non-custodial': { title: 'Why Non-Custodial?', body: 'You control the keys and your funds; no one can freeze them.' },
  'learnTopic-kyc': { title: 'KYC and Privacy', body: 'How identity checks affect privacy and transaction tracking.' },
  'learnTopic-keys': { title: 'Keep Your Keys Safe', body: 'Protect your recovery phrase and keep backups offline.' },
  onboardingNew: { title: 'New User', body: 'Secure your wallet with a passphrase and create a new recovery phrase.' },
  onboardingReturning: { title: 'Returning User', body: 'Import an existing recovery phrase or restore from encrypted backup.' },
  merchantOverview: { title: 'Merchant overview', body: 'Pricing uses a future peg for testnet demos and receives to your current address.' },
  merchantConverter: { title: 'Quick converter', body: 'Convert USD to BTC/sats and back using the demo peg.' },
  merchantItems: { title: 'Sample items', body: 'Preview how item pricing converts to BTC and sats.' },
  merchantLive: { title: 'Live BTC/USD', body: 'Live Blockstream price feed for merchant catalog calculations.' },
  merchantCatalog: { title: 'Catalog', body: 'Create items with USD pricing that auto-convert to BTC.' },
  merchantInvoice: { title: 'Create invoice', body: 'Generate BIP21 invoices for customer payments.' },
  merchantInvoices: { title: 'Invoices', body: 'View generated invoices and copy payment links.' },
  referLink: { title: 'Referral link', body: 'Generate your referral link by enrolling with an email.' },
  referJoin: { title: 'Join with a referral', body: 'Sign up with a referral code to track attribution.' },
  signMessage: { title: 'Sign Message', body: 'Create a signed message to prove address ownership.' },
  addressProof: { title: 'Address proof', body: 'Provide a signature to prove you control an address.' },
}

const getWindowEl = (id: string) =>
  document.querySelector<HTMLElement>(`.window[data-window-id="${id}"]`)

const ensureState = (id: string): WindowState => {
  if (!windows[id]) {
    windows[id] = { isOpen: true, isMinimized: false, isMaximized: false, lastFocusEl: null }
  }
  return windows[id]
}

const getHelpModal = () => document.getElementById('window-help-modal') as HTMLDivElement | null
const getHelpTitle = () => document.getElementById('window-help-title') as HTMLHeadingElement | null
const getHelpBody = () => document.getElementById('window-help-body') as HTMLDivElement | null
const getBackdrop = () => document.getElementById('window-backdrop') as HTMLDivElement | null

const updateMaximizeButton = (btn: HTMLButtonElement, isMax: boolean) => {
  btn.textContent = isMax ? '[ ]' : '[]'
  btn.setAttribute('aria-label', isMax ? 'Restore' : 'Maximize')
  btn.setAttribute('title', isMax ? 'Restore' : 'Maximize')
}

const updateMinimizeButton = (btn: HTMLButtonElement, isMin: boolean) => {
  btn.textContent = isMin ? '-' : '_'
  btn.setAttribute('aria-label', isMin ? 'Restore' : 'Minimize')
  btn.setAttribute('title', isMin ? 'Restore' : 'Minimize')
}

const emitWindowEvent = (name: string, id: string) => {
  try {
    document.dispatchEvent(new CustomEvent(name, { detail: { id } }))
  } catch {}
}

export const openWindow = (id: string) => {
  const el = getWindowEl(id)
  if (!el) return
  const state = ensureState(id)
  state.lastFocusEl = document.activeElement as HTMLElement | null
  state.isOpen = true
  el.removeAttribute('hidden')
  el.style.display = ''
}

export const closeWindow = (id: string) => {
  const el = getWindowEl(id)
  if (!el) return
  const state = ensureState(id)
  state.isOpen = false
  el.setAttribute('hidden', 'true')
  if (state.lastFocusEl) state.lastFocusEl.focus()
  emitWindowEvent('window:close', id)
}

export const toggleMinimize = (id: string) => {
  const el = getWindowEl(id)
  if (!el) return
  const state = ensureState(id)
  state.isMinimized = !state.isMinimized
  el.classList.toggle('is-minimized', state.isMinimized)
  const btn = el.querySelector<HTMLButtonElement>('[data-window-action="minimize"]')
  if (btn) updateMinimizeButton(btn, state.isMinimized)
}

export const toggleMaximize = (id: string) => {
  const el = getWindowEl(id)
  if (!el) return
  const state = ensureState(id)
  state.isMaximized = !state.isMaximized
  el.classList.toggle('is-maximized', state.isMaximized)
  const backdrop = getBackdrop()
  backdrop?.classList.toggle('is-visible', state.isMaximized)
  document.body.classList.toggle('window-lock', state.isMaximized)
  const btn = el.querySelector<HTMLButtonElement>('[data-window-action="maximize"]')
  if (btn) updateMaximizeButton(btn, state.isMaximized)
}

export const openHelp = (id: string) => {
  const modal = getHelpModal()
  if (!modal) return
  const entry = helpContent[id]
  const el = getWindowEl(id)
  const title = entry?.title || el?.dataset.title || 'Help'
  const body = entry?.body || 'No help available for this panel.'
  getHelpTitle()!.textContent = title
  getHelpBody()!.textContent = body
  modal.classList.add('is-visible')
  modal.setAttribute('aria-hidden', 'false')
  modal.querySelector<HTMLButtonElement>('[data-window-action="close-help"]')?.focus()
}

export const closeHelp = () => {
  const modal = getHelpModal()
  if (!modal) return
  modal.classList.remove('is-visible')
  modal.setAttribute('aria-hidden', 'true')
}

const onAction = (action: string, windowId: string, target: HTMLElement) => {
  if (action === 'close-help') return closeHelp()
  if (!windowId) return
  const state = ensureState(windowId)
  if (action === 'help') return openHelp(windowId)
  if (action === 'minimize') return toggleMinimize(windowId)
  if (action === 'maximize') return toggleMaximize(windowId)
  if (action === 'close') {
    state.lastFocusEl = document.activeElement as HTMLElement
    return closeWindow(windowId)
  }
  if (action === 'backdrop') {
    if (state.isMaximized) toggleMaximize(windowId)
  }
}

export const initWindowManager = () => {
  if (!getBackdrop()) {
    const backdrop = document.createElement('div')
    backdrop.id = 'window-backdrop'
    backdrop.className = 'window-backdrop'
    backdrop.addEventListener('click', () => {
      const maxed = document.querySelector<HTMLElement>('.window.is-maximized')
      if (maxed?.dataset.windowId) toggleMaximize(maxed.dataset.windowId)
    })
    document.body.appendChild(backdrop)
  }

  if (!getHelpModal()) {
    const modal = document.createElement('div')
    modal.id = 'window-help-modal'
    modal.className = 'window-help-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-hidden', 'true')
    modal.innerHTML = `
      <div class="window-help__panel">
        <div class="window-help__title" id="window-help-title">Help</div>
        <div class="window-help__body" id="window-help-body"></div>
        <div class="window-help__actions">
          <button class="btn" data-window-action="close-help" aria-label="Close help" title="Close help">Close</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
  }

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null
    if (!target) return
    const actionEl = target.closest<HTMLElement>('[data-window-action]')
    if (!actionEl) return
    const action = actionEl.dataset.windowAction || ''
    const windowEl = actionEl.closest<HTMLElement>('.window')
    const windowId = windowEl?.dataset.windowId || ''
    onAction(action, windowId, actionEl)
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const help = getHelpModal()
    if (help?.classList.contains('is-visible')) {
      e.preventDefault()
      closeHelp()
      return
    }
    const maxed = document.querySelector<HTMLElement>('.window.is-maximized')
    if (maxed?.dataset.windowId) {
      e.preventDefault()
      toggleMaximize(maxed.dataset.windowId)
    }
  })
}

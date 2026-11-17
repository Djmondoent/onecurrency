import { encryptMnemonic, decryptMnemonic } from './crypto'

const MNEMONIC_KEY = 'main.mnemonic'
const EMAIL_KEY = 'main.email'
const ADDR_INDEX_KEY = 'main.addrIndex'
const ADDR_TYPE_KEY = 'main.addrType'
const TIP_DEFAULT_KEY = 'main.tipDefault'
const TIP_SHOW_KEY = 'main.tipShow'
const HIDE_BALANCE_KEY = 'main.hideBalance'
const PRICE_PROVIDER_KEY = 'main.priceProvider'
const MERCHANT_ITEMS_KEY = 'main.merchantItems'
const FIAT_CURRENCY_KEY = 'main.fiatCurrency'
const SESSION_MNEMONIC_KEY = 'main.session.mnemonic'
const SESSION_EXP_KEY = 'main.session.expires'
const DEFAULT_SESSION_MS = 30 * 60 * 1000 // 30 minutes

let memoryMnemonic: string | null = null
let memoryMnemonicExpiresAt: number | null = null

function getSessionExpiry(): number | null {
  try {
    const raw = sessionStorage.getItem(SESSION_EXP_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

function isSessionExpired(): boolean {
  const exp = memoryMnemonicExpiresAt || getSessionExpiry()
  if (!exp) return false
  return Date.now() > exp
}

function cacheSessionMnemonic(m: string, ttlMs?: number) {
  const ms = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_SESSION_MS
  memoryMnemonic = m
  memoryMnemonicExpiresAt = Date.now() + ms
  try {
    sessionStorage.removeItem(SESSION_MNEMONIC_KEY)
    sessionStorage.setItem(SESSION_EXP_KEY, String(memoryMnemonicExpiresAt))
  } catch {}
}

// Do not allow plaintext mnemonics to linger in localStorage; move to a temp session and wipe the stored copy.
function sanitizeLegacyMnemonic(): string | null {
  try {
    const raw = localStorage.getItem(MNEMONIC_KEY)
    if (raw && !raw.startsWith('enc::')) {
      const clean = raw.trim()
      if (clean) {
        cacheSessionMnemonic(clean)
      }
      localStorage.removeItem(MNEMONIC_KEY)
      return clean || null
    }
  } catch {}
  return null
}

export function clearSessionMnemonic() {
  memoryMnemonic = null
  memoryMnemonicExpiresAt = null
  try { sessionStorage.removeItem(SESSION_MNEMONIC_KEY) } catch {}
  try { sessionStorage.removeItem(SESSION_EXP_KEY) } catch {}
}

export function lockSessionMnemonic() {
  clearSessionMnemonic()
}

export async function saveMnemonic(m: string, passphrase: string, ttlMs?: number) {
  const clean = m.trim()
  const pass = (passphrase || '').trim()
  if (!pass) throw new Error('Passphrase required to save wallet securely')
  const enc = await encryptMnemonic(clean, pass)
  localStorage.setItem(MNEMONIC_KEY, `enc::${enc}`)
  cacheSessionMnemonic(clean, ttlMs)
}

export function getMnemonic(): string | null {
  try {
    if (isSessionExpired()) { clearSessionMnemonic(); return null }
    if (memoryMnemonic && memoryMnemonic.trim()) return memoryMnemonic.trim()
    const cached = sessionStorage.getItem(SESSION_MNEMONIC_KEY)
    if (cached && cached.trim()) {
      cacheSessionMnemonic(cached.trim())
      return cached.trim()
    }
  } catch {}
  const legacy = sanitizeLegacyMnemonic()
  if (legacy) return legacy
  const m = localStorage.getItem(MNEMONIC_KEY)
  if (!m) return null
  if (m.startsWith('enc::')) return null
  return null
}

export function hasMnemonic(): boolean {
  return !!getMnemonic()
}

export function hasEncryptedMnemonic(): boolean {
  const m = localStorage.getItem(MNEMONIC_KEY)
  return !!(m && m.startsWith('enc::'))
}

export async function unlockMnemonic(passphrase: string, ttlMs?: number): Promise<string> {
  const m = localStorage.getItem(MNEMONIC_KEY)
  if (!m || !m.startsWith('enc::')) throw new Error('No encrypted wallet found')
  const json = m.slice('enc::'.length)
  const dec = await decryptMnemonic(json, passphrase)
  cacheSessionMnemonic(dec.trim(), ttlMs)
  return dec.trim()
}

export function clearWallet() {
  localStorage.removeItem(MNEMONIC_KEY)
  localStorage.removeItem(ADDR_INDEX_KEY)
  clearSessionMnemonic()
}

export function saveEmail(email: string) {
  localStorage.setItem(EMAIL_KEY, email.trim())
}

export function getEmail(): string | null {
  const v = localStorage.getItem(EMAIL_KEY)
  return v && v.trim().length > 0 ? v : null
}

export function getAddressIndex(): number {
  const v = localStorage.getItem(ADDR_INDEX_KEY)
  const n = v ? parseInt(v, 10) : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function setAddressIndex(n: number) {
  const val = Math.max(0, Math.floor(n))
  localStorage.setItem(ADDR_INDEX_KEY, String(val))
}

export function incrementAddressIndex(): number {
  const next = getAddressIndex() + 1
  setAddressIndex(next)
  return next
}

export function getDefaultTip(): number {
  const v = localStorage.getItem(TIP_DEFAULT_KEY)
  const n = v ? parseInt(v, 10) : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function setDefaultTip(n: number) {
  const val = Math.max(0, Math.floor(n))
  localStorage.setItem(TIP_DEFAULT_KEY, String(val))
}

export function getShowTip(): boolean {
  const v = localStorage.getItem(TIP_SHOW_KEY)
  if (v === null) return true
  return v === '1'
}

export function setShowTip(show: boolean) {
  localStorage.setItem(TIP_SHOW_KEY, show ? '1' : '0')
}

export type AddressType = 'legacy' | 'nested-segwit' | 'native-segwit' | 'taproot'
export function getAddressType(): AddressType {
  const v = localStorage.getItem(ADDR_TYPE_KEY)
  if (v === 'legacy' || v === 'nested-segwit' || v === 'native-segwit' || v === 'taproot') return v
  return 'native-segwit'
}
export function setAddressType(t: AddressType) {
  localStorage.setItem(ADDR_TYPE_KEY, t)
}

export function getHideBalance(): boolean {
  const v = localStorage.getItem(HIDE_BALANCE_KEY)
  return v === '1'
}
export function setHideBalance(hide: boolean) {
  localStorage.setItem(HIDE_BALANCE_KEY, hide ? '1' : '0')
}

export function getFiatCurrency(): string {
  const v = localStorage.getItem(FIAT_CURRENCY_KEY)
  return v && v.trim() ? v.trim().toUpperCase() : 'USD'
}

export function setFiatCurrency(code: string) {
  const clean = (code || '').trim().toUpperCase()
  if (clean) localStorage.setItem(FIAT_CURRENCY_KEY, clean)
}

export type PriceProvider = 'coingecko' | 'bitfinex' | 'bitstamp' | 'coindesk' | 'coincap' | 'mempool' | 'blockstream'
export function getPriceProvider(): PriceProvider {
  const v = (localStorage.getItem(PRICE_PROVIDER_KEY) || '').trim()
  if (v === 'coingecko' || v === 'bitfinex' || v === 'bitstamp' || v === 'coindesk' || v === 'coincap' || v === 'mempool' || v === 'blockstream') return v
  return 'coingecko'
}
export function setPriceProvider(provider: PriceProvider) {
  localStorage.setItem(PRICE_PROVIDER_KEY, provider)
}

export type StoredMerchantItem = { id: string; name: string; priceUsd: number; description?: string }
export function getMerchantItems(): StoredMerchantItem[] {
  try {
    const raw = localStorage.getItem(MERCHANT_ITEMS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => (
      item
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.priceUsd === 'number'
      && (typeof item.description === 'string' || typeof item.description === 'undefined')
    ))
  } catch {
    return []
  }
}

export function setMerchantItems(items: StoredMerchantItem[]) {
  try {
    localStorage.setItem(MERCHANT_ITEMS_KEY, JSON.stringify(items))
  } catch {}
}

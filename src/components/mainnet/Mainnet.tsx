import React, { useEffect, useMemo, useState } from 'react'
import { getMnemonic, hasMnemonic, saveMnemonic, clearWallet, getEmail, saveEmail, getAddressIndex, setAddressIndex, incrementAddressIndex, getDefaultTip, setDefaultTip, getShowTip, setShowTip, getAddressType, setAddressType, getHideBalance as getHideBalancePref, setHideBalance as setHideBalancePref, hasEncryptedMnemonic, unlockMnemonic, lockSessionMnemonic, getMerchantItems, setMerchantItems, getFiatCurrency, setFiatCurrency, getPriceProvider, setPriceProvider, AddressType, PriceProvider } from '../../lib/storage.mainnet'
import { QRCodeCanvas } from 'qrcode.react'
import { generateMnemonic, isSupportedMnemonic, normalizeMnemonic } from '../../lib/wallet.mainnet'
import { fetchTipHeight, getApiBase, fetchAddressInfo as fetchAddressInfoMainnet, fetchAddressTxs, AddressTx, fetchBtcUsd, fetchBtcFiat, fetchTx as fetchTxMainnet, fetchBlockHashByHeight as fetchBlockHashByHeightMainnet, fetchBlock as fetchBlockMainnet } from '../../lib/api.mainnet'
import { fetchAddressInfo as fetchAddressInfoTestnet, fetchAddressTxs as fetchAddressTxsTestnet, fetchTx as fetchTxTestnet, fetchBlockHashByHeight as fetchBlockHashByHeightTestnet, fetchBlock as fetchBlockTestnet } from '../../lib/api'
import { ensureEccInit, setNetwork, Network, getAddress, getBalance, signMessageBytes as signMessageBytesMain, estimateFeeRate, getUtxos, maxSpendable, isValidAddress as isValidAddressMainnet, buildAndBroadcast } from '../../lib/wallet.mainnet'
import { isValidAddress as isValidAddressTestnet } from '../../lib/wallet'
import { sha256 } from '@noble/hashes/sha256'
import { encryptMnemonic, decryptMnemonic } from '../../lib/crypto'
import OnboardingMain from './OnboardingMain'
import Receive from '../Receive'
import SendMain from './SendMain'
import BuyBitcoin from '../BuyBitcoin'
import QrScanner from '../QrScanner'
import Downloads from '../Downloads'
import { useI18n } from '../../i18n'
import VRWallet from '../VRWallet'
import CreditUnion from '../CreditUnion'
import SatsReminder from '../SatsReminder'
import Referral from '../Referral'
import { playReceiveSound } from '../../receiveSound'
import WindowShell from '../WindowShell'
import WalletStyleEditor from '../WalletStyleEditor'

type Tab = 'wallet' | 'buy' | 'receive' | 'send' | 'backup' | 'settings' | 'merchant' | 'privacy' | 'support' | 'downloads' | 'credit' | 'refer' | 'lookup' | 'faucet'
type Mode = 'beginner' | 'advanced'
type MerchantItem = { id: string; name: string; priceUsd: number; description?: string }
type Invoice = { id: string; itemId: string; qty: number; usdTotal: number; btcAmount: number; sats: number; note?: string; bip21: string }
type LookupType = 'address' | 'txid' | 'block'
type LookupNetwork = 'mainnet' | 'testnet' | 'unknown'
type LookupNetChoice = Exclude<LookupNetwork, 'unknown'>
type LookupInfo = {
  address: string
  network: LookupNetwork
  confirmedSats: number
  mempoolSats: number
  balanceSats: number
  totalReceivedSats: number
  totalSentSats: number
  txCount: number
  mempoolTxCount: number
}
type LookupTxInfo = {
  txid: string
  confirmed: boolean
  blockHeight: number | null
  blockTime: number | null
  feeSats: number | null
  vsize: number | null
}
type LookupBlockInfo = {
  hash: string
  height: number
  timestamp: number | null
  txCount: number | null
  size: number | null
  weight: number | null
}
type OnboardingStatus = 'welcome' | 'needs-backup' | 'done'

const WALLET_BLOCKS = ['walletAddress', 'walletBalance', 'satsReminder', 'converter', 'addressHistory', 'recentActivity'] as const
type WalletBlockId = typeof WALLET_BLOCKS[number]
const loadWalletOrder = (key: string): WalletBlockId[] => {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter((v) => WALLET_BLOCKS.includes(v)) as WalletBlockId[]
      const missing = WALLET_BLOCKS.filter((v) => !filtered.includes(v))
      return [...filtered, ...missing]
    }
  } catch {}
  return [...WALLET_BLOCKS]
}
const saveWalletOrder = (key: string, order: WalletBlockId[]) => {
  try { localStorage.setItem(key, JSON.stringify(order)) } catch {}
}
const SUPPORTED_FIAT = ['USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'SGD', 'NZD', 'SEK', 'NOK', 'DKK', 'INR', 'IRR', 'RUB', 'BRL', 'MXN', 'ZAR', 'KRW', 'NGN']
const FIAT_META: Record<string, { name: string; flag: string }> = {
  USD: { name: 'United States', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  EUR: { name: 'Eurozone', flag: '\uD83C\uDDEA\uD83C\uDDFA' },
  JPY: { name: 'Japan', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  GBP: { name: 'United Kingdom', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  AUD: { name: 'Australia', flag: '\uD83C\uDDE6\uD83C\uDDFA' },
  CAD: { name: 'Canada', flag: '\uD83C\uDDE8\uD83C\uDDE6' },
  CHF: { name: 'Switzerland', flag: '\uD83C\uDDE8\uD83C\uDDED' },
  CNY: { name: 'China', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
  HKD: { name: 'Hong Kong', flag: '\uD83C\uDDED\uD83C\uDDF0' },
  SGD: { name: 'Singapore', flag: '\uD83C\uDDF8\uD83C\uDDEC' },
  NZD: { name: 'New Zealand', flag: '\uD83C\uDDF3\uD83C\uDDFF' },
  SEK: { name: 'Sweden', flag: '\uD83C\uDDF8\uD83C\uDDEA' },
  NOK: { name: 'Norway', flag: '\uD83C\uDDF3\uD83C\uDDF4' },
  DKK: { name: 'Denmark', flag: '\uD83C\uDDE9\uD83C\uDDF0' },
  INR: { name: 'India', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  IRR: { name: 'Iran', flag: '\uD83C\uDDEE\uD83C\uDDF7' },
  RUB: { name: 'Russia', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
  BRL: { name: 'Brazil', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
  MXN: { name: 'Mexico', flag: '\uD83C\uDDF2\uD83C\uDDFD' },
  ZAR: { name: 'South Africa', flag: '\uD83C\uDDFF\uD83C\uDDE6' },
  KRW: { name: 'South Korea', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
  NGN: { name: 'Nigeria', flag: '\uD83C\uDDF3\uD83C\uDDEC' },
}
const PRICE_PROVIDER_OPTIONS: Array<{ id: PriceProvider; label: string; scope: 'multi-currency' | 'USD only' }> = [
  { id: 'coingecko', label: 'CoinGecko', scope: 'multi-currency' },
  { id: 'bitfinex', label: 'Bitfinex', scope: 'USD only' },
  { id: 'bitstamp', label: 'Bitstamp', scope: 'USD only' },
  { id: 'coindesk', label: 'CoinDesk', scope: 'USD only' },
  { id: 'coincap', label: 'CoinCap', scope: 'USD only' },
  { id: 'mempool', label: 'mempool.space', scope: 'multi-currency' },
  { id: 'blockstream', label: 'Blockstream', scope: 'USD only' },
]

const ADDRESS_BATCH = 25
const ADDRESS_SCROLL_STEP = 5
const MAINNET_ONBOARDING_KEY = 'main.onboarding.status'

const readOnboardingStatus = (walletExists: boolean): OnboardingStatus => {
  if (!walletExists) return 'welcome'
  try {
    const raw = localStorage.getItem(MAINNET_ONBOARDING_KEY)
    if (raw === 'welcome' || raw === 'needs-backup' || raw === 'done') return raw
  } catch {}
  return 'done'
}

const persistOnboardingStatus = (status: OnboardingStatus) => {
  try {
    localStorage.setItem(MAINNET_ONBOARDING_KEY, status)
  } catch {}
}

export default function Mainnet({ mode = 'beginner', onWalletChange }: { mode?: Mode, onWalletChange?: (exists: boolean) => void }) {
  const { t, lang, setLang, supported } = useI18n()
  const isAdvanced = mode === 'advanced'
  const [ready, setReady] = useState(false)
  const didInitialRefresh = React.useRef(false)
  const [tab, setTab] = useState<Tab>('wallet')
  const [address, setAddress] = useState<string>('')
  const [addrIndex, setAddrIndexState] = useState<number>(getAddressIndex())
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [conn, setConn] = useState<string>('')
  const [err, setErr] = useState<string>('')
  const [email, setEmailState] = useState<string>(getEmail() || '')
  const [backupStatus, setBackupStatus] = useState<string>('')
  const [txs, setTxs] = useState<Array<{ txid: string; confirmed: boolean; time: number | null; delta: number }>>([])
  const [txsLoading, setTxsLoading] = useState(false)
  const [txsErr, setTxsErr] = useState<string | null>(null)
  const [txsRefreshBusy, setTxsRefreshBusy] = useState(false)
  const incomingSeenRef = React.useRef<Set<string>>(new Set())
  const txAddrRef = React.useRef<string>('')
  const txsReqRef = React.useRef(0)
  const addressReqRef = React.useRef(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [walletOrder, setWalletOrder] = useState<WalletBlockId[]>(() => loadWalletOrder('main.wallet.blockOrder'))
  const [walletReorder, setWalletReorder] = useState(false)
  const [dragId, setDragId] = useState<WalletBlockId | null>(null)
  const [addrListOpen, setAddrListOpen] = useState(false)
  const [addrListLoading, setAddrListLoading] = useState(false)
  const [addrListErr, setAddrListErr] = useState<string | null>(null)
  const [addrList, setAddrList] = useState<Array<{ index: number; address: string; balance: number | null }>>([])
  const [addrListCursor, setAddrListCursor] = useState<number | null>(null)
  const [addrListHasMore, setAddrListHasMore] = useState(false)
  const [addrListLoadingMore, setAddrListLoadingMore] = useState(false)
  const addrListRef = React.useRef(addrList)
  const addrListScrollRef = React.useRef<HTMLDivElement | null>(null)
  const addrRowObserverRef = React.useRef<IntersectionObserver | null>(null)
  const addrBalancePendingRef = React.useRef<Set<number>>(new Set())
  const balanceReqRef = React.useRef(0)
  const addrBalancesReqRef = React.useRef(0)
  const balanceCacheRef = React.useRef<Map<string, number>>(new Map())
  const lastWalletRefreshRef = React.useRef(0)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceErr, setBalanceErr] = useState<string | null>(null)
  const [balanceRefreshBusy, setBalanceRefreshBusy] = useState(false)
  const balanceStorageKey = (addr: string) => `main.addr.balance.${addr}`
  const readStoredBalance = (addr: string): number | null => {
    try {
      const raw = localStorage.getItem(balanceStorageKey(addr))
      if (!raw) return null
      const n = parseInt(raw, 10)
      return Number.isFinite(n) ? n : null
    } catch {
      return null
    }
  }
  const writeStoredBalance = (addr: string, val: number) => {
    try {
      localStorage.setItem(balanceStorageKey(addr), String(val))
    } catch {}
  }
  const [prefStatus, setPrefStatus] = useState<string>('')
  const [showTipPref, setShowTipPref] = useState<boolean>(getShowTip())
  const [defaultTipPref, setDefaultTipPref] = useState<string>(String(getDefaultTip() || 0))
  const [addrType, setAddrType] = useState<AddressType>(getAddressType())
  const [showUnlockForm, setShowUnlockForm] = useState<boolean>(() => hasEncryptedMnemonic() && !getMnemonic())
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>(() => readOnboardingStatus(hasMnemonic() || hasEncryptedMnemonic()))
  useEffect(() => {
    persistOnboardingStatus(onboardingStatus)
  }, [onboardingStatus])
  const [unlockDuration, setUnlockDuration] = useState<string>('30m')
  const [restoreJson, setRestoreJson] = useState<string>('')
  const [restorePw, setRestorePw] = useState<string>('')
  const [showRestorePw, setShowRestorePw] = useState(false)
  const [restoreStatus, setRestoreStatus] = useState<string>('')
  const [backupPassphrase, setBackupPassphrase] = useState<string>('')
  const [showBackupPassphrase, setShowBackupPassphrase] = useState(false)
  const [lastBackupJson, setLastBackupJson] = useState<string>('')
  const [recoveryPlain, setRecoveryPlain] = useState<string>('')
  const [recoveryStatus, setRecoveryStatus] = useState<string>('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotWords, setForgotWords] = useState<string>('')
  const [forgotNewPw, setForgotNewPw] = useState<string>('')
  const [showForgotNewPw, setShowForgotNewPw] = useState(false)
  const [forgotStatus, setForgotStatus] = useState<string>('')
  const countWords = (text: string) => {
    const normalized = normalizeMnemonic(text)
    return normalized ? normalized.split(' ').length : 0
  }
  const hasValidWordCount = (text: string) => {
    return isSupportedMnemonic(text)
  }
  const [newWalletPw, setNewWalletPw] = useState<string>('')
  const [showNewWalletPw, setShowNewWalletPw] = useState(false)
  const [newWalletStatus, setNewWalletStatus] = useState<string>('')
  const [unlockPw, setUnlockPw] = useState<string>('')
  const [showUnlockPw, setShowUnlockPw] = useState(false)
  const [signInputType, setSignInputType] = useState<'text' | 'hex'>('text')
  const [signMsgText, setSignMsgText] = useState('')
  const [signMsgHex, setSignMsgHex] = useState('')
  const [signHexErr, setSignHexErr] = useState('')
  const [signHashHex, setSignHashHex] = useState('')
  const [signOut, setSignOut] = useState<{ sig: string; pub: string } | null>(null)
  const defaultMerchantItems: MerchantItem[] = [
    { id: 'pack-starter', name: 'OneCurrency Starter Pack', priceUsd: 19, description: 'Wallet cards + quick start guide for in-store onboarding.' },
    { id: 'consult-setup', name: 'POS Setup Session', priceUsd: 49, description: 'We configure OneCurrency for your business and staff.' },
  ]
  const [merchantItems, setMerchantItemsState] = useState<MerchantItem[]>(() => {
    const stored = getMerchantItems()
    return stored.length ? stored : defaultMerchantItems
  })
  const [invoiceItemId, setInvoiceItemId] = useState<string>('')
  const [invoiceQty, setInvoiceQty] = useState<number>(1)
  const [invoiceNote, setInvoiceNote] = useState<string>('')
  const [invoiceStatus, setInvoiceStatus] = useState<string>('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [newItemName, setNewItemName] = useState('')
  const [newItemUsd, setNewItemUsd] = useState<string>('')
  const [newItemDesc, setNewItemDesc] = useState('')
  const [fiatCurrency, setFiatCurrencyState] = useState<string>(() => {
    const stored = getFiatCurrency()
    return SUPPORTED_FIAT.includes(stored) ? stored : 'USD'
  })
  const [priceProvider, setPriceProviderState] = useState<PriceProvider>(() => getPriceProvider())
  const [vrOpen, setVrOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [creditNoticeOpen, setCreditNoticeOpen] = useState(false)
  const priceTimerRef = React.useRef<number | null>(null)
  const priceFiatTimerRef = React.useRef<number | null>(null)
  const refreshingRef = React.useRef(false)
  const pollingRef = React.useRef(false)
  const [lookupType, setLookupType] = useState<LookupType>('address')
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupNetwork, setLookupNetwork] = useState<LookupNetwork>('unknown')
  const [lookupNetChoice, setLookupNetChoice] = useState<LookupNetChoice>('mainnet')
  const [lookupInfo, setLookupInfo] = useState<LookupInfo | null>(null)
  const [lookupTxInfo, setLookupTxInfo] = useState<LookupTxInfo | null>(null)
  const [lookupBlockInfo, setLookupBlockInfo] = useState<LookupBlockInfo | null>(null)
  const [lookupTxs, setLookupTxs] = useState<Array<{ txid: string; confirmed: boolean; time: number | null; delta: number }>>([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupErr, setLookupErr] = useState<string | null>(null)
  const [lookupShowUsd, setLookupShowUsd] = useState(false)
  const [lookupScanOpen, setLookupScanOpen] = useState(false)
  const toHex = (u8: Uint8Array) => Array.from(u8).map(b => b.toString(16).padStart(2,'0')).join('')
  const fromHex = (hex: string) => {
    const h = hex.trim().toLowerCase().replace(/^0x/, '')
    if (!/^[0-9a-f]*$/.test(h) || h.length % 2) return null
    const out = new Uint8Array(h.length/2)
    for (let i=0;i<out.length;i++) out[i] = parseInt(h.substr(i*2,2),16)
    return out
  }
  const recomputeHash = () => {
    try {
      setSignHexErr('')
      let bytes: Uint8Array
      if (signInputType === 'text') {
        bytes = new TextEncoder().encode(signMsgText)
        setSignMsgHex(toHex(bytes))
      } else {
        const b = fromHex(signMsgHex)
        if (!b) { setSignHexErr('Invalid hex'); setSignHashHex(''); return }
        bytes = b
      }
      const encoder = new TextEncoder()
      const prefix = encoder.encode('Bitcoin Signed Message:\n')
      const varInt = (n: number): Uint8Array => {
        if (n < 0xfd) return Uint8Array.of(n)
        if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, (n >>> 8) & 0xff)
        if (n <= 0xffffffff) return Uint8Array.of(0xfe, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff)
        const out = new Uint8Array(9); out[0] = 0xff
        let x = BigInt(n)
        for (let i = 1; i <= 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n }
        return out
      }
      const concat = (...arrs: Uint8Array[]) => {
        const total = arrs.reduce((a, b) => a + b.length, 0)
        const out = new Uint8Array(total)
        let off = 0
        for (const a of arrs) { out.set(a, off); off += a.length }
        return out
      }
      const payload = concat(varInt(prefix.length), prefix, varInt(bytes.length), bytes)
      const h1 = sha256(payload)
      const h2 = sha256(h1)
      setSignHashHex(toHex(h2))
    } catch { setSignHashHex('') }
  }
  useEffect(() => { recomputeHash() }, [signInputType, signMsgText, signMsgHex])
  const onSign = async () => {
    try {
      setSignOut(null)
      if (!proofMsg) { setBackupStatus('No message to sign'); return }
      const bytes = new TextEncoder().encode(proofMsg)
      const res = await signMessageBytesMain(addrIndex, bytes)
      setSignOut({ sig: res.signature, pub: res.pubkey })
    } catch (e: any) {
      setBackupStatus(e?.message || 'Failed to sign message')
    }
  }

  // Address proof (mainnet)
  const [proofAddress, setProofAddress] = useState<string>('')
  const [proofMsg, setProofMsg] = useState<string>('')
  const [proofSig, setProofSig] = useState<string>('')
  const [proofStatus, setProofStatus] = useState<string>('')
  useEffect(() => { setProofAddress(address) }, [address])
  const genProofMsg = () => {
    try {
      // @ts-ignore
      const id = (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)
      setProofMsg(id)
    } catch {
      setProofMsg(Math.random().toString(16).slice(2) + Date.now().toString(16))
    }
  }
  useEffect(() => { if (!proofMsg) genProofMsg() }, [])
  const [proofHashHex, setProofHashHex] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const qrScanner = (
    <QrScanner
      open={scanOpen}
      onClose={() => setScanOpen(false)}
      onResult={(v) => {
        setRestoreJson(v)
        setRestoreStatus('Scanned QR from camera')
        setScanOpen(false)
      }}
      title="Scan Encrypted Backup QR"
      helperText="Point your camera at the encrypted backup QR. We only read this locally."
    />
  )
  useEffect(() => {
    try {
      const encoder = new TextEncoder()
      const prefix = encoder.encode('Bitcoin Signed Message:\n')
      const varInt = (n: number): Uint8Array => {
        if (n < 0xfd) return Uint8Array.of(n)
        if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, (n >>> 8) & 0xff)
        if (n <= 0xffffffff) return Uint8Array.of(0xfe, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff)
        const out = new Uint8Array(9); out[0] = 0xff
        let x = BigInt(n)
        for (let i = 1; i <= 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n }
        return out
      }
      const concat = (...arrs: Uint8Array[]) => {
        const total = arrs.reduce((a, b) => a + b.length, 0)
        const out = new Uint8Array(total)
        let off = 0
        for (const a of arrs) { out.set(a, off); off += a.length }
        return out
      }
      const bytes = encoder.encode(proofMsg || '')
      const payload = concat(varInt(prefix.length), prefix, varInt(bytes.length), bytes)
      const h1 = sha256(payload)
      const h2 = sha256(h1)
      setProofHashHex(toHex(h2))
    } catch { setProofHashHex('') }
  }, [proofMsg])
  useEffect(() => {
    ;(async () => {
      await ensureEccInit()
      setNetwork(Network.Mainnet)
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { id?: string } | undefined
      if (detail?.id === 'aboutOneCurrency') setAboutOpen(false)
      if (detail?.id === 'wipeConfirmMainnet') setWipeConfirmOpen(false)
    }
    document.addEventListener('window:close', handler)
    return () => document.removeEventListener('window:close', handler)
  }, [])


  const requirePassphrase = async (ttlMs?: number): Promise<string | null> => {
    setErr('')
    // First try cached session (already unlocked)
    const cached = getMnemonic()
    if (cached) return cached

    const stored = localStorage.getItem('main.mnemonic')
    if (hasEncryptedMnemonic() || (stored && stored.startsWith('enc::'))) {
      const pw = unlockPw.trim()
      if (!pw) { setErr('Passphrase required'); setShowUnlockForm(true); return null }
      try {
        const m = await unlockMnemonic(pw.trim(), ttlMs)
        setErr('')
        setShowUnlockForm(false)
        setUnlockPw('')
        return m
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase()
        const friendly = msg.includes('pass') || msg.includes('invalid')
          ? 'Incorrect passphrase. Wallet is still locked.'
          : (e?.message || 'Failed to unlock wallet')
        setErr(friendly)
        setShowUnlockForm(true)
        return null
      }
    }
    const m = getMnemonic()
    if (m) return m
    setErr('No wallet seed found')
    return null
  }

  const unlockIfNeeded = async (ttlMs?: number): Promise<string | null> => {
    let m = getMnemonic()
    if (m) { setErr(''); return m }
    if (hasEncryptedMnemonic()) {
      const pw = unlockPw.trim()
      if (!pw) { setErr(''); setShowUnlockForm(true); return null }
      try {
        m = await unlockMnemonic(pw, ttlMs)
        setErr('')
        setUnlockPw('')
        setShowUnlockForm(false)
        return m
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase()
        const friendly = msg.includes('pass') || msg.includes('invalid')
          ? 'Incorrect passphrase. Wallet is still locked.'
          : (e?.message || 'Failed to unlock wallet')
        setErr(friendly)
        setShowUnlockForm(true)
        return null
      }
    }
    return null
  }

  const handleUnlock = async () => {
    const m = await unlockIfNeeded(durationToMs(unlockDuration))
    if (m) { refresh(); setShowUnlockForm(false) }
  }

  const lockNow = () => {
    lockSessionMnemonic()
    setUnlockPw('')
    setShowUnlockForm(true)
    setForgotOpen(false)
    setForgotStatus('')
    setErr('')
    setAddress('')
    setBalance(null)
  }

  useEffect(() => {
    if (!ready) return
    if (!hasMnemonic()) return
    if (didInitialRefresh.current) return
    didInitialRefresh.current = true
    refresh()
  }, [ready])

  useEffect(() => {
    if (hasEncryptedMnemonic() && !getMnemonic()) setShowUnlockForm(true)
  }, [])

  // Privacy: hide balance setting
  const [hideBalance, setHideBalanceState] = useState<boolean>(getHideBalancePref())
  const toggleHideBalance = () => { const next = !hideBalance; setHideBalanceState(next); setHideBalancePref(next) }

  // Format BTC like a credit card number (grouped digits)
  const formatAsCardDigits = (numStr: string) => {
    if (!numStr) return ''
    const [intPartRaw, fracPartRaw = ''] = String(numStr).split('.')
    const intGroups: string[] = []
    for (let i = 0; i < intPartRaw.length; i += 4) intGroups.push(intPartRaw.slice(i, i + 4))
    const fracGroups: string[] = []
    for (let i = 0; i < fracPartRaw.length; i += 4) fracGroups.push(fracPartRaw.slice(i, i + 4))
    const left = intGroups.join(' ')
    const right = fracGroups.length ? fracGroups.join(' ') : ''
    return right ? `${left}.${right}` : left
  }

  const detectLookupNetwork = (addr: string): LookupNetwork => {
    const v = addr.trim().toLowerCase()
    if (!v) return 'unknown'
    if (v.startsWith('bc1') || v.startsWith('1') || v.startsWith('3')) return 'mainnet'
    if (v.startsWith('tb1') || v.startsWith('m') || v.startsWith('n') || v.startsWith('2')) return 'testnet'
    return 'unknown'
  }

  const formatBtc = (sats: number) => {
    const btc = sats / 1e8
    return formatAsCardDigits(btc.toFixed(8))
  }

  const formatFiat = (amount: number, currency = fiatCurrency) => (
    amount.toLocaleString(lang, { style: 'currency', currency })
  )
  const getFiatLabel = (currency: string) => {
    const meta = FIAT_META[currency]
    if (!meta) return currency
    return `${meta.flag} ${meta.name} - ${currency}`
  }
  const getPriceProviderLabel = (id: PriceProvider) => {
    const opt = PRICE_PROVIDER_OPTIONS.find((item) => item.id === id)
    if (!opt) return id
    return `${opt.label} - ${opt.scope}`
  }

  const formatFiatFromSats = (sats: number) => {
    if (!btcFiat) return `${fiatCurrency} unavailable`
    const fiat = (sats / 1e8) * btcFiat
    return formatFiat(fiat, fiatCurrency)
  }

  const renderAmount = (sats: number) => lookupShowUsd
    ? formatFiatFromSats(sats)
    : `${formatBtc(sats)} BTC`

  const resetLookupResults = () => {
    setLookupInfo(null)
    setLookupTxInfo(null)
    setLookupBlockInfo(null)
    setLookupTxs([])
  }
  const parseLookupAddress = (value: string) => {
    const raw = value.trim()
    if (!raw) return ''
    const lower = raw.toLowerCase()
    if (lower.startsWith('bitcoin:')) {
      const withoutScheme = raw.slice(8)
      const split = withoutScheme.split('?')[0]
      return split.trim()
    }
    if (raw.includes('\n') || raw.includes(' ')) {
      return raw.split(/\s+/g)[0].trim()
    }
    return raw
  }

  const mapTxsForAddress = (addr: string, data: AddressTx[]) => {
    return (data || []).map((t) => {
      const inAmt = (t.vout || []).reduce((a, o) => a + ((o.scriptpubkey_address === addr ? (o.value || 0) : 0)), 0)
      const outAmt = (t.vin || []).reduce((a, i) => a + ((i.prevout && i.prevout.scriptpubkey_address === addr ? (i.prevout.value || 0) : 0)), 0)
      const delta = inAmt - outAmt
      return { txid: t.txid, confirmed: !!t.status?.confirmed, time: t.status?.block_time || null, delta }
    })
  }

  const loadLookup = async () => {
    const query = lookupQuery.trim()
    if (!query) {
      setLookupErr(lookupType === 'address'
        ? 'Enter a Bitcoin address.'
        : lookupType === 'txid'
          ? 'Enter a transaction id.'
          : 'Enter a block height.')
      return
    }
    const net = lookupType === 'address' ? detectLookupNetwork(query) : lookupNetChoice
    setLookupNetwork(net)
    resetLookupResults()
    if (lookupType === 'address') {
      const isValid = net === 'mainnet'
        ? isValidAddressMainnet(query)
        : net === 'testnet'
          ? isValidAddressTestnet(query)
          : false
      if (!isValid) { setLookupErr('Enter a valid Bitcoin address (mainnet or testnet).'); return }
    } else if (lookupType === 'txid') {
      if (!/^[0-9a-f]{64}$/i.test(query)) { setLookupErr('Enter a valid 64-character transaction id.'); return }
    } else if (lookupType === 'block') {
      if (!/^\d+$/.test(query)) { setLookupErr('Enter a numeric block height.'); return }
    }
    setLookupErr(null)
    setLookupLoading(true)
    try {
      if (lookupType === 'address') {
        if (net === 'mainnet') {
          const [info, txs] = await Promise.all([
            fetchAddressInfoMainnet(query),
            fetchAddressTxs(query),
          ])
          const chain = info?.chain_stats || { funded_txo_sum: 0, spent_txo_sum: 0 }
          const mempool = info?.mempool_stats || { funded_txo_sum: 0, spent_txo_sum: 0 }
          const confirmedSats = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0)
          const mempoolSats = (mempool.funded_txo_sum || 0) - (mempool.spent_txo_sum || 0)
          const totalReceivedSats = (chain.funded_txo_sum || 0) + (mempool.funded_txo_sum || 0)
          const totalSentSats = (chain.spent_txo_sum || 0) + (mempool.spent_txo_sum || 0)
          const chainTxCount = Number((chain as any)?.tx_count || 0)
          const mempoolTxCount = Number((mempool as any)?.tx_count || 0)
          setLookupInfo({
            address: query,
            network: net,
            confirmedSats,
            mempoolSats,
            balanceSats: confirmedSats + mempoolSats,
            totalReceivedSats,
            totalSentSats,
            txCount: chainTxCount,
            mempoolTxCount,
          })
          setLookupTxs(mapTxsForAddress(query, txs))
        } else if (net === 'testnet') {
          const [info, txs] = await Promise.all([
            fetchAddressInfoTestnet(query),
            fetchAddressTxsTestnet(query),
          ])
          const chain = info?.chain_stats || { funded_txo_sum: 0, spent_txo_sum: 0 }
          const mempool = info?.mempool_stats || { funded_txo_sum: 0, spent_txo_sum: 0 }
          const confirmedSats = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0)
          const mempoolSats = (mempool.funded_txo_sum || 0) - (mempool.spent_txo_sum || 0)
          const totalReceivedSats = (chain.funded_txo_sum || 0) + (mempool.funded_txo_sum || 0)
          const totalSentSats = (chain.spent_txo_sum || 0) + (mempool.spent_txo_sum || 0)
          const chainTxCount = Number((chain as any)?.tx_count || 0)
          const mempoolTxCount = Number((mempool as any)?.tx_count || 0)
          setLookupInfo({
            address: query,
            network: net,
            confirmedSats,
            mempoolSats,
            balanceSats: confirmedSats + mempoolSats,
            totalReceivedSats,
            totalSentSats,
            txCount: chainTxCount,
            mempoolTxCount,
          })
          setLookupTxs(mapTxsForAddress(query, txs as AddressTx[]))
        }
      } else if (lookupType === 'txid') {
        const tx = net === 'mainnet'
          ? await fetchTxMainnet(query)
          : await fetchTxTestnet(query)
        setLookupTxInfo({
          txid: tx?.txid || query,
          confirmed: !!tx?.status?.confirmed,
          blockHeight: Number.isFinite(tx?.status?.block_height) ? Number(tx.status.block_height) : null,
          blockTime: Number.isFinite(tx?.status?.block_time) ? Number(tx.status.block_time) : null,
          feeSats: Number.isFinite(tx?.fee) ? Number(tx.fee) : null,
          vsize: Number.isFinite(tx?.vsize) ? Number(tx.vsize) : Number.isFinite(tx?.weight) ? Math.ceil(Number(tx.weight) / 4) : null,
        })
      } else if (lookupType === 'block') {
        const height = Number.parseInt(query, 10)
        const hash = net === 'mainnet'
          ? await fetchBlockHashByHeightMainnet(height)
          : await fetchBlockHashByHeightTestnet(height)
        const block = net === 'mainnet'
          ? await fetchBlockMainnet(hash)
          : await fetchBlockTestnet(hash)
        setLookupBlockInfo({
          hash: block?.id || hash,
          height: Number.isFinite(block?.height) ? Number(block.height) : height,
          timestamp: Number.isFinite(block?.timestamp) ? Number(block.timestamp) : null,
          txCount: Number.isFinite(block?.tx_count) ? Number(block.tx_count) : null,
          size: Number.isFinite(block?.size) ? Number(block.size) : null,
          weight: Number.isFinite(block?.weight) ? Number(block.weight) : null,
        })
      }
    } catch (e: any) {
      const label = lookupType === 'address'
        ? 'address'
        : lookupType === 'txid'
          ? 'transaction'
          : 'block'
      setLookupErr(e?.message || `Failed to load ${label} info`)
    } finally {
      setLookupLoading(false)
    }
  }

  const loadTxsFor = async (addr: string, force: boolean = false) => {
    const reqId = ++txsReqRef.current
    setTxsErr(null)
    setTxsLoading(true)
    const isNewAddress = txAddrRef.current !== addr
    try {
      const data = await fetchAddressTxs(addr, force)
      if (txsReqRef.current !== reqId) return
      const mapped = (data as AddressTx[]).map((t) => {
        const inAmt = (t.vout || []).reduce((a, o) => a + ((o.scriptpubkey_address === addr ? (o.value || 0) : 0)), 0)
        const outAmt = (t.vin || []).reduce((a, i) => a + ((i.prevout && i.prevout.scriptpubkey_address === addr ? (i.prevout.value || 0) : 0)), 0)
        const delta = inAmt - outAmt
        return { txid: t.txid, confirmed: !!t.status?.confirmed, time: t.status?.block_time || null, delta }
      })
      const incomingTxids = new Set(mapped.filter((t) => t.delta > 0).map((t) => t.txid))
      let hasNewIncoming = false
      if (!isNewAddress) {
        const prev = incomingSeenRef.current
        hasNewIncoming = mapped.some((t) => t.delta > 0 && !prev.has(t.txid))
      }
      incomingSeenRef.current = incomingTxids
      txAddrRef.current = addr
      if (hasNewIncoming) {
        playReceiveSound()
      }
      setTxs(mapped)
    } catch (e: any) {
      if (txsReqRef.current !== reqId) return
      setTxsErr(e?.message || 'Failed to load history')
      setTxs([])
    } finally {
      if (txsReqRef.current === reqId) setTxsLoading(false)
    }
  }

  const loadBalanceFor = async (addr: string, force: boolean = false): Promise<number | null> => {
    const reqId = ++balanceReqRef.current
    if (force) {
      setBalanceLoading(true)
    } else {
      const cached = balanceCacheRef.current.get(addr)
      if (typeof cached === 'number') {
        setBalance(cached)
        setBalanceLoading(false)
      } else {
        const stored = readStoredBalance(addr)
        if (typeof stored === 'number') {
          setBalance(stored)
          balanceCacheRef.current.set(addr, stored)
          setBalanceLoading(false)
        } else {
          setBalanceLoading(true)
        }
      }
    }
    setBalanceErr(null)
    try {
      const b = await getBalance(addr, force)
      if (balanceReqRef.current !== reqId) return null
      setBalance(b)
      balanceCacheRef.current.set(addr, b)
      writeStoredBalance(addr, b)
      setBalanceErr(null)
      return b
    } catch (e: any) {
      if (balanceReqRef.current !== reqId) return null
      setBalance(null)
      const status = e?.response?.status
      if (status === 429) {
        setErr('Rate limited by Blockstream. Please wait a few minutes and retry.')
      }
      setBalanceErr(e?.message || 'Failed to load balance')
      return null
    } finally {
      if (balanceReqRef.current === reqId) setBalanceLoading(false)
    }
  }

  const primeAddrBalances = async (items: Array<{ index: number; address: string; balance: number | null }>) => {
    const reqId = ++addrBalancesReqRef.current
    const queue = items.filter((i) => i.balance === null)
    const workerCount = 3
    const workers = Array.from({ length: workerCount }).map(async () => {
      while (queue.length) {
        if (addrBalancesReqRef.current !== reqId) return
        const item = queue.shift()
        if (!item) return
        if (addrBalancePendingRef.current.has(item.index)) continue
        addrBalancePendingRef.current.add(item.index)
        try {
          const b = await getBalance(item.address)
          if (addrBalancesReqRef.current !== reqId) return
          balanceCacheRef.current.set(item.address, b)
          writeStoredBalance(item.address, b)
          if (item.address === address) {
            setBalance(b)
            setBalanceLoading(false)
          }
          setAddrList((prev) => prev.map((i) => (i.index === item.index ? { ...i, balance: b } : i)))
        } finally {
          addrBalancePendingRef.current.delete(item.index)
        }
      }
    })
    await Promise.all(workers)
  }

  const selectAddress = async (nextIndex: number, addr: string, knownBalance?: number | null): Promise<number | null> => {
    ++addressReqRef.current
    setAddressIndex(nextIndex)
    setAddrIndexState(nextIndex)
    setAddress(addr)
    if (typeof knownBalance === 'number') {
      setBalance(knownBalance)
      balanceCacheRef.current.set(addr, knownBalance)
      writeStoredBalance(addr, knownBalance)
      setBalanceLoading(false)
    }
    const [b] = await Promise.all([loadBalanceFor(addr), loadTxsFor(addr)])
    return b
  }

  const refresh = async () => {
    if (refreshingRef.current) return
    const addrReqId = ++addressReqRef.current
    const m = await unlockIfNeeded(durationToMs(unlockDuration))
    if (!m) { setErr('No wallet seed found'); return }
    setLoading(true)
    refreshingRef.current = true
    try {
      setErr('')
      const idx = getAddressIndex()
      setAddrIndexState(idx)
      const addr = await getAddress(m, idx)
      if (addressReqRef.current !== addrReqId) return
      setAddress(addr)
      await Promise.all([loadBalanceFor(addr, true), loadTxsFor(addr)])
    } catch (e: any) {
      const status = e?.response?.status
      if (status !== 429) {
        setErr(e?.message || 'Failed to refresh wallet')
      }
    } finally {
      refreshingRef.current = false
      setLoading(false)
    }
  }

  const refreshCurrentAddress = async (force: boolean = false) => {
    if (!address || (pollingRef.current && !force)) return
    pollingRef.current = true
    try {
      await Promise.all([loadBalanceFor(address, force), loadTxsFor(address)])
    } finally {
      pollingRef.current = false
    }
  }

  useEffect(() => {
    if (tab !== 'wallet' || !address) return
    const now = Date.now()
    if (now - lastWalletRefreshRef.current < 15_000) return
    lastWalletRefreshRef.current = now
    void refreshCurrentAddress(true)
  }, [tab, address])

  const refreshBalanceOnly = async () => {
    if (!address) return
    if (balanceRefreshBusy) return
    setBalanceRefreshBusy(true)
    setBalanceErr(null)
    setBalanceLoading(true)
    try {
      await loadBalanceFor(address, true)
    } finally {
      setBalanceRefreshBusy(false)
    }
  }

  const refreshTxsOnly = async () => {
    if (!address) return
    if (txsRefreshBusy) return
    setTxsRefreshBusy(true)
    setTxsErr(null)
    setTxsLoading(true)
    try {
      await loadTxsFor(address, true)
    } finally {
      setTxsRefreshBusy(false)
    }
  }

  const onDragStart = (evt: React.DragEvent, id: WalletBlockId) => {
    if (!walletReorder) return
    try { evt.dataTransfer.setData('text/plain', id) } catch {}
    setDragId(id)
  }
  const onDragOver = (evt: React.DragEvent) => {
    if (!walletReorder) return
    evt.preventDefault()
  }
  const onDrop = (targetId: WalletBlockId) => {
    if (!walletReorder || !dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    setWalletOrder((prev) => {
      const next = [...prev]
      const from = next.indexOf(dragId)
      const to = next.indexOf(targetId)
      if (from === -1 || to === -1) return prev
      next.splice(from, 1)
      next.splice(to, 0, dragId)
      saveWalletOrder('main.wallet.blockOrder', next)
      return next
    })
    setDragId(null)
  }
  const blockOrder = (id: WalletBlockId) => {
    const idx = walletOrder.indexOf(id)
    return idx === -1 ? 999 : idx
  }

  const currentAddrBalance = useMemo(() => {
    if (!address) return null
    const hit = addrList.find((i) => i.address === address)
    return typeof hit?.balance === 'number' ? hit.balance : null
  }, [address, addrList])

  useEffect(() => {
    if (!address) return
    if (typeof balance === 'number') return
    if (typeof currentAddrBalance !== 'number') return
    setBalance(currentAddrBalance)
    balanceCacheRef.current.set(address, currentAddrBalance)
    setBalanceLoading(false)
  }, [address, balance, currentAddrBalance])

  // Live BTC/USD for balance
  const [btcUsd, setBtcUsd] = useState<number | null>(null)
  const [btcFiat, setBtcFiat] = useState<number | null>(null)
  const [convertUsd, setConvertUsd] = useState<string>('')
  const [convertBtc, setConvertBtc] = useState<string>('')
  const btcPerUsd = useMemo(() => (btcUsd && btcUsd > 0 ? 1 / btcUsd : 0), [btcUsd])
  const fiatPerSat = useMemo(() => (btcFiat ? btcFiat / 1e8 : 0), [btcFiat])
  const btcPerFiat = useMemo(() => (btcFiat && btcFiat > 0 ? 1 / btcFiat : 0), [btcFiat])
  const usdToFiat = useMemo(() => (btcUsd && btcFiat ? btcFiat / btcUsd : 0), [btcUsd, btcFiat])
  const convertUsdNum = useMemo(() => Math.max(0, parseFloat(convertUsd || '0') || 0), [convertUsd])
  const convertBtcNum = useMemo(() => Math.max(0, parseFloat(convertBtc || '0') || 0), [convertBtc])
  const displayBalance = typeof balance === 'number' ? balance : currentAddrBalance
  useEffect(() => {
    let active = true
    const loadPrice = async () => {
      try {
        const p = await fetchBtcUsd()
        if (active) setBtcUsd(p)
      } catch {
        if (active) setBtcUsd(null)
      } finally {
        if (active) priceTimerRef.current = window.setTimeout(loadPrice, 300_000)
      }
    }
    loadPrice()
    return () => { active = false; if (priceTimerRef.current) window.clearTimeout(priceTimerRef.current) }
  }, [priceProvider])

  useEffect(() => {
    let active = true
    const loadFiatPrice = async () => {
      try {
        const p = await fetchBtcFiat(fiatCurrency)
        if (active) setBtcFiat(p)
      } catch {
        if (active) setBtcFiat(null)
      } finally {
        if (active) priceFiatTimerRef.current = window.setTimeout(loadFiatPrice, 300_000)
      }
    }
    loadFiatPrice()
    return () => { active = false; if (priceFiatTimerRef.current) window.clearTimeout(priceFiatTimerRef.current) }
  }, [fiatCurrency, priceProvider])

  useEffect(() => {
    if (!SUPPORTED_FIAT.includes(fiatCurrency)) {
      setFiatCurrencyState('USD')
      return
    }
    setFiatCurrency(fiatCurrency)
  }, [fiatCurrency])

  useEffect(() => {
    if (!address) return
    if (typeof balance === 'number') return
    if (balanceLoading) return
    void loadBalanceFor(address)
  }, [address])

  useEffect(() => {
    if (merchantItems.length && !invoiceItemId) setInvoiceItemId(merchantItems[0].id)
  }, [merchantItems, invoiceItemId])

  useEffect(() => {
    setMerchantItems(merchantItems)
  }, [merchantItems])

  const durationToMs = (dur: string): number => {
    const map: Record<string, number> = {
      '2mins': 2 * 60 * 1000,
      '10mins': 10 * 60 * 1000,
      '30mins': 30 * 60 * 1000,
      '1hours': 60 * 60 * 1000,
      '6hours': 6 * 60 * 60 * 1000,
      '12hours': 12 * 60 * 60 * 1000,
      '24hours': 24 * 60 * 60 * 1000,
      '72hours': 72 * 60 * 60 * 1000,
      '1week': 7 * 24 * 60 * 60 * 1000,
      '1month': 30 * 24 * 60 * 60 * 1000
    }
    return map[dur] || map['30m']
  }

  const handleForgotRestore = async () => {
    setForgotStatus('')
    const phrase = normalizeMnemonic(forgotWords)
    if (!phrase) { setForgotStatus('Enter your 12, 20, or 24 recovery words.'); return }
    if (!hasValidWordCount(phrase)) { setForgotStatus('Enter a valid 12- or 24-word BIP39 phrase, or a legacy 20-word OneCurrency phrase.'); return }
    const newPw = forgotNewPw.trim()
    if (!newPw) { setForgotStatus('Set a new passphrase to encrypt this device.'); return }
    try {
      await saveMnemonic(phrase, newPw, durationToMs(unlockDuration))
      setForgotStatus('Restored and protected with your new passphrase.')
      setShowUnlockForm(false)
      setUnlockPw('')
      setForgotWords('')
      setForgotNewPw('')
      setForgotOpen(false)
      await refresh()
    } catch (e: any) {
      setForgotStatus(e?.message || 'Failed to restore from recovery words.')
    }
  }

  const handleStartFreshWallet = async () => {
    setNewWalletStatus('')
    const pw = newWalletPw.trim()
    if (!pw) { setNewWalletStatus('Set a new passphrase first.'); return }
    if (!confirm('This will remove the existing wallet from this device and create a brand-new one. Continue?')) return
    try {
      clearWallet()
      const m = await generateMnemonic()
      await saveMnemonic(m, pw, durationToMs(unlockDuration))
      setRecoveryPlain(m)
      setShowUnlockForm(false)
      setForgotOpen(false)
      setUnlockPw('')
      setNewWalletStatus('New wallet created. Write down your recovery words now.')
      await refresh()
    } catch (e: any) {
      setNewWalletStatus(e?.message || 'Failed to create new wallet.')
    }
  }

  const handleEncryptedRestoreLocked = async () => {
    setRestoreStatus('')
    const json = restoreJson.trim()
    const pw = restorePw.trim()
    if (!json || !pw) { setRestoreStatus('Enter backup JSON/QR contents and its password.'); return }
    try {
      const m = await decryptMnemonic(json, pw)
      if (!hasValidWordCount(m)) { setRestoreStatus(`Decryption succeeded but phrase has ${countWords(m)} words and is not a supported recovery phrase`); return }
      await saveMnemonic(m, pw, durationToMs(unlockDuration))
      await refresh()
      setRestoreStatus('Decrypted and imported wallet (using the same password)')
      setShowUnlockForm(false)
      setForgotOpen(false)
      setUnlockPw('')
    } catch (e: any) {
      setRestoreStatus(e?.message || 'Failed to decrypt backup')
    }
  }

  const priceToBtc = (usd: number) => btcPerUsd > 0 ? usd * btcPerUsd : 0
  const priceToSats = (usd: number) => {
    if (!btcPerUsd) return 0
    return Math.max(0, Math.round(priceToBtc(usd) * 1e8))
  }

  const addMerchantItem = () => {
    setInvoiceStatus('')
    const price = Number.parseFloat(newItemUsd)
    if (!newItemName.trim() || !Number.isFinite(price) || price <= 0) {
      setInvoiceStatus('Enter a name and a positive USD price.')
      return
    }
    const item: MerchantItem = {
      id: (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : `item-${Date.now()}`,
      name: newItemName.trim(),
      priceUsd: Math.round(price * 100) / 100,
      description: newItemDesc.trim() || undefined,
    }
    setMerchantItemsState((prev) => [...prev, item])
    if (!invoiceItemId) setInvoiceItemId(item.id)
    setNewItemName('')
    setNewItemUsd('')
    setNewItemDesc('')
    setInvoiceStatus('Item saved for checkout.')
  }

  const removeMerchantItem = (id: string) => {
    setInvoiceStatus('')
    setMerchantItemsState((prev) => {
      const next = prev.filter((item) => item.id !== id)
      if (invoiceItemId === id) setInvoiceItemId(next[0]?.id || '')
      return next
    })
    setInvoiceStatus('Item removed from catalog.')
  }

  const createInvoice = () => {
    setInvoiceStatus('')
    const item = merchantItems.find((i) => i.id === invoiceItemId)
    if (!item) { setInvoiceStatus('Pick an item to invoice.'); return }
    if (!address) { setInvoiceStatus('Generate a receiving address first.'); return }
    if (!btcPerUsd) { setInvoiceStatus('Waiting for live BTC/USD rate from Blockstream...'); return }
    const qty = Math.max(1, Math.floor(invoiceQty || 1))
    const usdTotal = item.priceUsd * qty
    const btcAmount = priceToBtc(usdTotal)
    const sats = priceToSats(usdTotal)
    const label = encodeURIComponent(`Invoice ${invoices.length + 1} - ${item.name}`)
    const message = encodeURIComponent(invoiceNote || 'Thank you for your purchase')
    const bip21 = `bitcoin:${address}?amount=${btcAmount.toFixed(8)}&label=${label}&message=${message}`
    const inv: Invoice = {
      id: (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : `inv-${Date.now()}`,
      itemId: item.id,
      qty,
      usdTotal,
      btcAmount,
      sats,
      note: invoiceNote || undefined,
      bip21,
    }
    setInvoices((prev) => [inv, ...prev])
    setInvoiceStatus('Invoice created. Share the QR or BIP21 link with the buyer.')
  }

  const loadAddresses = async () => {
    const m = await requirePassphrase(durationToMs(unlockDuration))
    if (!m) { setAddrListErr('Passphrase required to load addresses'); return }
    setAddrListErr(null)
    setAddrListLoading(true)
    try {
      const current = getAddressIndex()
      const end = Math.max(current - ADDRESS_BATCH + 1, 0)
      const items: Array<{ index: number; address: string; balance: number | null }> = []
      for (let i = current; i >= end; i--) {
        const a = await getAddress(m, i)
        items.push({ index: i, address: a, balance: null })
      }
      const nextIndex = end - 1
      setAddrList(items)
      setAddrListCursor(nextIndex >= 0 ? nextIndex : null)
      setAddrListHasMore(nextIndex >= 0)
      void primeAddrBalances(items)
    } catch (e: any) {
      setAddrListErr(e?.message || 'Failed to load addresses')
      setAddrList([])
      setAddrListCursor(null)
      setAddrListHasMore(false)
    } finally {
      setAddrListLoading(false)
    }
  }

  const loadMoreAddresses = async () => {
    if (addrListLoadingMore || addrListLoading || !addrListHasMore || addrListCursor === null) return
    const m = await requirePassphrase(durationToMs(unlockDuration))
    if (!m) { setAddrListErr('Passphrase required to load addresses'); return }
    setAddrListLoadingMore(true)
    try {
      const start = addrListCursor
      const end = Math.max(start - ADDRESS_SCROLL_STEP + 1, 0)
      const items: Array<{ index: number; address: string; balance: number | null }> = []
      for (let i = start; i >= end; i--) {
        const a = await getAddress(m, i)
        items.push({ index: i, address: a, balance: null })
      }
      const nextIndex = end - 1
      setAddrList((prev) => [...prev, ...items])
      setAddrListCursor(nextIndex >= 0 ? nextIndex : null)
      setAddrListHasMore(nextIndex >= 0)
      void primeAddrBalances(items)
    } catch (e: any) {
      setAddrListErr(e?.message || 'Failed to load addresses')
    } finally {
      setAddrListLoadingMore(false)
    }
  }

  const onAddrListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      loadMoreAddresses()
    }
  }

  useEffect(() => {
    addrListRef.current = addrList
  }, [addrList])

  useEffect(() => {
    if (!addrListOpen) return
    const root = addrListScrollRef.current
    if (!root) return
    if (addrRowObserverRef.current) addrRowObserverRef.current.disconnect()
    addrRowObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const idxAttr = entry.target.getAttribute('data-addr-index')
        const addr = entry.target.getAttribute('data-addr')
        if (!idxAttr || !addr) return
        const index = Number(idxAttr)
        if (!Number.isFinite(index)) return
        const existing = addrListRef.current.find((i) => i.index === index)
        if (!existing || existing.balance !== null) return
        if (addrBalancePendingRef.current.has(index)) return
        addrBalancePendingRef.current.add(index)
        getBalance(addr).then((b) => {
          setAddrList((prev) => prev.map((i) => (i.index === index ? { ...i, balance: b } : i)))
        }).finally(() => {
          addrBalancePendingRef.current.delete(index)
        })
      })
    }, { root, rootMargin: '120px 0px', threshold: 0.01 })
    const rows = root.querySelectorAll('[data-addr-index]')
    rows.forEach((row) => addrRowObserverRef.current?.observe(row))
    return () => addrRowObserverRef.current?.disconnect()
  }, [addrListOpen, addrList.length])


  useEffect(() => { if (hasMnemonic() || hasEncryptedMnemonic()) refresh() }, [ready])

  useEffect(() => {
    if (tab !== 'wallet') return
    if (!address) return
    const id = window.setInterval(() => { refreshCurrentAddress() }, 5_000)
    return () => window.clearInterval(id)
  }, [tab, address])

  useEffect(() => {
    if (tab !== 'wallet') return
    if (!address) return
    void loadBalanceFor(address)
    void loadTxsFor(address)
  }, [tab, address])

  const onCreate = async (passphrase: string, addrTypePref: AddressType = addrType, mnemonicOverride?: string): Promise<boolean> => {
    const m = mnemonicOverride || await generateMnemonic()
    try {
      setAddressType(addrTypePref)
      setAddrType(addrTypePref)
      setAddressIndex(0)
      setAddrIndexState(0)
      setAddress('')
      setBalance(null)
      setAddrList([])
      setAddrListCursor(null)
      setAddrListHasMore(false)
      balanceCacheRef.current.clear()
      await saveMnemonic(m, passphrase, durationToMs(unlockDuration))
      await refresh()
      onWalletChange?.(true)
      return true
    } catch (e: any) {
      setErr(e?.message || 'Failed to save wallet')
      return false
    }
  }

  const onImport = async (m: string, passphrase: string, addrTypePref: AddressType = addrType): Promise<boolean> => {
    try {
      setAddressType(addrTypePref)
      setAddrType(addrTypePref)
      setAddressIndex(0)
      setAddrIndexState(0)
      setAddress('')
      setBalance(null)
      setAddrList([])
      setAddrListCursor(null)
      setAddrListHasMore(false)
      balanceCacheRef.current.clear()
      await saveMnemonic(m, passphrase, durationToMs(unlockDuration))
      await refresh()
      onWalletChange?.(true)
      return true
    } catch (e: any) {
      setErr(e?.message || 'Failed to import wallet')
      return false
    }
  }

  const onWipe = () => {
    clearWallet()
    setAddress('')
    setBalance(null)
    setTab('wallet')
    setOnboardingStatus('welcome')
    persistOnboardingStatus('welcome')
    onWalletChange?.(false)
  }

  const handleForgotWipe = () => {
    const ok = confirm('This will remove the wallet from this device and return you to onboarding. Continue?')
    if (!ok) return
    onWipe()
    setForgotOpen(false)
    setShowUnlockForm(false)
    setUnlockPw('')
    setErr('')
  }

  const onWipeWithAuth = async () => {
    const m = await requirePassphrase(durationToMs(unlockDuration))
    if (!m) { setErr('Passphrase required to wipe'); return }
    onWipe()
  }

  const testConnection = async () => {
    setConn('Testing...')
    try {
      const h = await fetchTipHeight()
      setConn(`OK | tip height ${h} | ${getApiBase()}`)
    } catch (e: any) {
      setConn(`Failed | ${e?.message || 'network error'}`)
    }
  }

  // Wipe: confirm + optional sweep (mainnet)
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false)
  const [sweepDest, setSweepDest] = useState('13vscqNC3WjkNPfVbZdQokZokY8aidez6D')
  const [sweepBusy, setSweepBusy] = useState(false)
  const [sweepErr, setSweepErr] = useState<string | null>(null)

  const onOpenWipe = () => {
    if (typeof balance === 'number' && balance > 0) {
      setSweepErr(null)
      setWipeConfirmOpen(true)
    } else {
      if (confirm('This will remove your wallet from this browser. Continue?')) onWipeWithAuth()
    }
  }

  const onSweepAndWipe = async () => {
    try {
      setSweepErr(null)
      if (!address) { setSweepErr('Wallet not ready'); return }
      if (!sweepDest || !isValidAddressMainnet(sweepDest)) { setSweepErr('Enter a valid mainnet address (bc1..., 1..., or 3...)'); return }
      setSweepBusy(true)
      const fr = await estimateFeeRate()
      const utxos = await getUtxos(address)
      const max = maxSpendable(utxos as any, fr)
      if (max <= 0) { setSweepErr('Nothing spendable after fee'); setSweepBusy(false); return }
      const auth = await requirePassphrase(durationToMs(unlockDuration))
      if (!auth) { setSweepErr('Passphrase required to wipe'); setSweepBusy(false); return }
      await buildAndBroadcast(address, sweepDest, max, fr)
      setWipeConfirmOpen(false)
      onWipe()
    } catch (e: any) {
      setSweepErr(e?.message || 'Sweep failed')
    } finally {
      setSweepBusy(false)
    }
  }

  const coreTabs: Tab[] = ['wallet', 'buy', 'receive', 'send', 'backup', 'settings', 'downloads', 'support', 'faucet']
  const advancedTabs: Tab[] = ['merchant', 'privacy', 'credit', 'refer']
  const publicTabs: Tab[] = ['lookup']
  const walletTabs: Tab[] = isAdvanced ? [...coreTabs, ...advancedTabs] : coreTabs
  const navTabs: Tab[] = isAdvanced ? [...coreTabs, ...advancedTabs, ...publicTabs] : [...coreTabs, ...publicTabs]
  const walletExists = hasMnemonic() || hasEncryptedMnemonic()
  const walletLocked = walletTabs.includes(tab) && hasEncryptedMnemonic() && !getMnemonic()
  const needsUnlockGate = walletLocked && showUnlockForm
  const needsOnboarding = walletTabs.includes(tab) && (!walletExists || onboardingStatus !== 'done')
  const displayErr = (needsUnlockGate && err?.toLowerCase().includes('no wallet seed found')) || (tab === 'lookup' && err?.toLowerCase().includes('no wallet seed found'))
    ? ''
    : err

  const handleOnboardingDone = () => {
    setOnboardingStatus('done')
    persistOnboardingStatus('done')
    setTab('wallet')
  }

  const handleOnboardingCreate = async (passphrase: string, addrTypePref: AddressType, mnemonicOverride?: string) => {
    const ok = await onCreate(passphrase, addrTypePref, mnemonicOverride)
    if (!ok) return false
    setOnboardingStatus('needs-backup')
    persistOnboardingStatus('needs-backup')
    return true
  }

  const handleOnboardingImport = async (m: string, passphrase: string, addrTypePref: AddressType) => {
    const ok = await onImport(m, passphrase, addrTypePref)
    return ok
  }

  useEffect(() => {
    if (!isAdvanced && !coreTabs.includes(tab) && tab !== 'lookup') setTab('wallet')
  }, [isAdvanced, tab])

  useEffect(() => {
    if (tab === 'credit') {
      setCreditNoticeOpen(true)
    }
  }, [tab])

  if (!ready) return <div className="container">Initializing...</div>

  if (needsUnlockGate) {
    return (
      <div className="container" id="wallet">
        <h1 className="heading">{t('app.mainnetTitle')}</h1>
        <p className="subtle">Wallet locked. Enter your passphrase to continue.</p>
        <div className="surface" style={{ marginTop: 12 }}>
          <div className="kv" style={{ fontWeight: 600 }}>Unlock Wallet</div>
          {displayErr && (<div className="alert" style={{ marginTop: 8 }}>{displayErr}</div>)}
          <label style={{ display: 'block', marginTop: 8 }}>
            Passphrase
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type={showUnlockPw ? 'text' : 'password'}
                form="noop-pass-form"
                placeholder="Enter your wallet passphrase"
                value={unlockPw}
                onChange={(e) => setUnlockPw(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUnlock() } }}
              />
              <button type="button" className="btn" onClick={() => setShowUnlockPw(v => !v)}>{showUnlockPw ? 'Hide' : 'Show'}</button>
            </div>
            <div className="subtle" style={{ marginTop: 6 }}>This passphrase only decrypts your wallet on this device. It is never sent to our servers.</div>
          </label>
          <label style={{ display: 'block', marginTop: 8 }}>
            Keep unlocked for
            <select className="input" value={unlockDuration} onChange={(e) => setUnlockDuration(e.target.value)}>
              <option value="2min">2 minutes</option>
              <option value="10min">10 minutes</option>
              <option value="30min">30 minutes</option>
              <option value="1hours">1 hour</option>
              <option value="6hours">6 hours</option>
              <option value="12hours">12 hours</option>
              <option value="24hours">24 hours</option>
              <option value="72hours">72 hours</option>
              <option value="1week">1 week</option>
              <option value="1month">1 month</option>
            </select>
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleUnlock}>Unlock</button>
            <button className="btn btn-ghost" onClick={lockNow}>Lock now</button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setForgotOpen(v => !v)}>
            {forgotOpen ? 'Hide restore options' : 'Forgot passphrase? Restore wallet'}
          </button>
          <button className="btn" onClick={() => setTab('lookup')}>Open address lookup</button>
        </div>
        {forgotOpen && (
          <>
            <WindowShell id="restoreWords" title="Restore with 12, 20, or 24 words" className="mt-12" style={{ lineHeight: 1.6 }}>
              <div className="subtle" style={{ marginTop: 4 }}>Set a new passphrase for this device after entering your recovery words.</div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Recovery phrase
                <textarea className="textarea" rows={3} placeholder="legal winner thank year wave sausage..." value={forgotWords} onChange={(e) => setForgotWords(e.target.value)} />
              </label>
              <label style={{ display: 'block', marginTop: 8 }}>
                New passphrase for this device
                <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input className="input" type={showForgotNewPw ? 'text' : 'password'} form="noop-pass-form" placeholder="New passphrase to encrypt locally" value={forgotNewPw} onChange={(e) => setForgotNewPw(e.target.value)} />
                  <button type="button" className="btn" onClick={() => setShowForgotNewPw(v => !v)}>{showForgotNewPw ? 'Hide' : 'Show'}</button>
                </div>
              </label>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={handleForgotRestore}>Restore &amp; set new passphrase</button>
                  <button className="btn btn-ghost" onClick={() => { setForgotOpen(false); setForgotStatus('') }}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleForgotWipe}>Wipe wallet &amp; start over</button>
                </div>
                {forgotStatus && <div className="badge" style={{ marginTop: 6 }}>{forgotStatus}</div>}
              </WindowShell>

            <WindowShell id="restoreEncrypted" title="Restore encrypted backup (JSON/QR)" className="mt-12" style={{ lineHeight: 1.6 }}>
              <div className="subtle" style={{ marginTop: 4 }}>
                You still need the original backup password to decrypt the JSON or QR. We will reuse that same password to lock this device.
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Encrypted JSON
                <textarea className="textarea" rows={3} placeholder="Paste encrypted backup JSON or QR contents" value={restoreJson} onChange={(e) => setRestoreJson(e.target.value)} />
              </label>
              <label style={{ display: 'block', marginTop: 8 }}>
                Backup password
                <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input className="input" type={showRestorePw ? 'text' : 'password'} form="noop-pass-form" placeholder="Password used when you created the backup" value={restorePw} onChange={(e) => setRestorePw(e.target.value)} />
                  <button type="button" className="btn" onClick={() => setShowRestorePw(v => !v)}>{showRestorePw ? 'Hide' : 'Show'}</button>
                </div>
              </label>
              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={handleEncryptedRestoreLocked}>Decrypt &amp; import</button>
                <button className="btn" onClick={() => setScanOpen(true)}>Scan QR</button>
              </div>
              {restoreStatus && <div className="badge" style={{ marginTop: 6 }}>{restoreStatus}</div>}
            </WindowShell>
            {qrScanner}

            <WindowShell id="startNewWallet" title="Start a new wallet" className="mt-12" style={{ lineHeight: 1.6 }}>
              <div className="alert" style={{ marginTop: 6 }}>
                This wipes the current wallet on this device. If you still need the old wallet, back up its seed before continuing.
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                New passphrase for the new wallet
                <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input className="input" type={showNewWalletPw ? 'text' : 'password'} form="noop-pass-form" placeholder="Set a new passphrase" value={newWalletPw} onChange={(e) => setNewWalletPw(e.target.value)} />
                  <button type="button" className="btn" onClick={() => setShowNewWalletPw(v => !v)}>{showNewWalletPw ? 'Hide' : 'Show'}</button>
                </div>
              </label>
              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-danger" onClick={handleStartFreshWallet}>Create new wallet</button>
              </div>
              {newWalletStatus && <div className="badge" style={{ marginTop: 6 }}>{newWalletStatus}</div>}
            </WindowShell>
          </>
        )}
      </div>
    )
  }

  if (needsOnboarding) {
    return (
      <div className="container" id="wallet">
        <OnboardingMain
          onCreate={handleOnboardingCreate}
          onImport={handleOnboardingImport}
          onDone={handleOnboardingDone}
          mode={mode}
          initialStage={onboardingStatus === 'needs-backup' ? 'backup' : 'welcome'}
        />
      </div>
    )
  }

  return (
    <div className="container" id="wallet">
      <h1 className="heading">{t('app.mainnetTitle')}</h1>
      <p className="subtle">{t('app.mainnetSubtitle')}</p>

      <div className="row toolbar" style={{ margin: '12px 0', flexWrap: 'wrap', gap: 8 }}>
        <nav className="tabs">
          {navTabs.map((item) => {
            const labelMap: Record<Tab, string> = {
              wallet: t('tab.wallet'),
              buy: 'Buy Bitcoin',
              receive: t('tab.receive'),
              send: t('tab.send'),
              backup: t('tab.backup'),
              settings: t('tab.settings'),
              merchant: t('tab.merchant'),
              privacy: t('tab.privacy'),
              support: t('tab.support'),
              downloads: t('tab.downloads'),
              credit: t('tab.credit'),
              refer: t('tab.refer'),
              lookup: t('tab.lookup'),
              faucet: 'Faucet',
            }
            const isCredit = item === 'credit'
            const onTabClick = () => {
              if (isCredit) {
                setTab(item)
                setCreditNoticeOpen(true)
                return
              }
              setTab(item)
            }
            return (
              <button
                key={item}
                className={`tab ${tab === item ? 'active' : ''} ${isCredit ? 'is-blocked' : ''}`}
                aria-current={tab === item ? 'page' : undefined}
                aria-disabled={isCredit ? true : undefined}
                onClick={onTabClick}
              >
                {item === 'wallet' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M3.5 7.5h14a2 2 0 0 1 2 2v7a0 0 0 0 1 0 0h-16a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z"/><path strokeWidth="1.5" d="M17 10h4v5h-4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2Z"/></svg>}
                {item === 'receive' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>}
                {item === 'send' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M12 21V9m0 0-4 4m4-4 4 4M4 3h16"/></svg>}
                {item === 'backup' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="m8 11 4 4 4-4"/><path strokeWidth="1.5" d="M12 3v12m7 6H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4l1.5-3h3L15 8h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1Z"/></svg>}
                {item === 'settings' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path strokeWidth="1.5" d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8 1 1 0 0 0-1.1-.2 7.7 7.7 0 0 1-2.3.6 1 1 0 0 0-.8.9v.2a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.8-.9 7.7 7.7 0 0 1-2.3-.6 1 1 0 0 0-1.1.2 2 2 0 1 1-2.8-2.8 1 1 0 0 0 .2-1.1 7.7 7.7 0 0 1 0-2.6Z"/></svg>}
                {item === 'merchant' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M4 7h16M4 12h16M4 17h16"/><path strokeWidth="1.5" d="M9 5v14m6-14v14"/></svg>}
                {item === 'privacy' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M12 4a5 5 0 0 0-5 5v2a5 5 0 0 0 10 0V9a5 5 0 0 0-5-5Z"/><path strokeWidth="1.5" d="M7 9h10"/></svg>}
                {item === 'support' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M12 21c4.4 0 8-3.1 8-7 0-1.7-.7-3.2-1.9-4.4-.4-.4-.5-1-.3-1.5.4-1.1.6-2.3.6-3.6C18.4 3 16.7 2 14.7 2c-1.3 0-2.6.5-3.7 1.3-.6.5-1.5.5-2.1 0C7.8 2.5 6.5 2 5.2 2 3.3 2 1.6 3 1 4.5 1 5.8 1.2 7 1.6 8c.2.5.1 1.1-.3 1.5C0.7 10.8 0 12.3 0 14c0 3.9 3.6 7 8 7h4Z"/><path strokeWidth="1.5" d="M8 14h8"/></svg>}
                {item === 'downloads' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>}
                {item === 'credit' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="m8.5 11 3.5 3 3.5-3"/><path strokeWidth="1.5" d="M12 4c2.5 0 4.5 2 4.5 4.5S14.5 13 12 13s-4.5-2-4.5-4.5S9.5 4 12 4Z"/><path strokeWidth="1.5" d="M5 20c0-2.8 3.1-5 7-5s7 2.2 7 5"/></svg>}
                {item === 'refer' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="m8.5 11 3.5 3 3.5-3"/><path strokeWidth="1.5" d="M12 4c2.5 0 4.5 2 4.5 4.5S14.5 13 12 13s-4.5-2-4.5-4.5S9.5 4 12 4Z"/><path strokeWidth="1.5" d="M5 20c0-2.8 3.1-5 7-5s7 2.2 7 5"/></svg>}
                {item === 'lookup' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z"/><path strokeWidth="1.5" d="M21 21l-4.3-4.3"/></svg>}
                {item === 'faucet' && <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="1.5" d="M6 5h12v4a6 6 0 0 1-12 0V5Z"/><path strokeWidth="1.5" d="M8 5V3h8v2m-4 10v4m-3-2h6"/></svg>}
                <span>{labelMap[item]}</span>
                {isCredit && <span className="credit-x" aria-hidden="true"></span>}
              </button>
            )
          })}
        </nav>
        {isAdvanced && <button className="btn" onClick={() => setVrOpen(true)}>{t('common.vrView')}</button>}
        <button id="wallet-refresh" onClick={refresh} disabled={loading} className="btn btn-ghost">
          {loading ? <span className="row"><span className="spinner spin"></span> {t('common.refreshing')}</span> : t('common.refresh')}
        </button>
      </div>
      <div className="status">{conn || t('common.statusMainnet')}</div>
      {displayErr && (<div className="alert">{displayErr}</div>)}
      {!needsUnlockGate && !showUnlockForm && hasEncryptedMnemonic() && tab !== 'lookup' && (
        <div className="row" style={{ marginTop: 6, gap: 8 }}>
          <button className="btn" onClick={lockNow}>Lock now</button>
          <span className="subtle">Session unlock: {unlockDuration}</span>
        </div>
      )}
      {!needsUnlockGate && showUnlockForm && tab !== 'lookup' && (
        <WindowShell id="unlockWallet" title="Unlock wallet" className="mt-12" style={{ lineHeight: 1.6 }}>
          <label style={{ display: 'block', marginTop: 8 }}>
            Passphrase
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type={showUnlockPw ? 'text' : 'password'}
                form="noop-pass-form"
                placeholder="Enter your wallet passphrase"
                value={unlockPw}
                onChange={(e) => setUnlockPw(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUnlock() } }}
              />
              <button type="button" className="btn" onClick={() => setShowUnlockPw(v => !v)}>{showUnlockPw ? 'Hide' : 'Show'}</button>
            </div>
            <div className="subtle" style={{ marginTop: 6 }}>This passphrase only decrypts your wallet on this device. It is never sent to our servers.</div>
          </label>
          <label style={{ display: 'block', marginTop: 8 }}>
            Keep unlocked for
            <select className="input" value={unlockDuration} onChange={(e) => setUnlockDuration(e.target.value)}>
              <option value="2mins">2 minutes</option>
              <option value="10mins">10 minutes</option>
              <option value="30mins">30 minutes</option>
              <option value="1hour">1 hour</option>
              <option value="6hours">6 hours</option>
              <option value="12hours">12 hours</option>
              <option value="24hours">24 hours</option>
              <option value="72hours">72 hours</option>
              <option value="1week">1 week</option>
              <option value="1month">1 month</option>
            </select>
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleUnlock}>Unlock</button>
            <button className="btn btn-ghost" onClick={lockNow}>Lock now</button>
          </div>
        </WindowShell>
      )}

      {tab === 'backup' && (
        <section>
          <WindowShell id="backup" title="Backup your wallet" bodyClassName="window-body-stack">
            <p className="subtle" style={{ marginTop: 6 }}>Write down your recovery phrase (12, 20, or 24 words). This is the only way to restore your wallet.</p>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn btn-primary" onClick={async () => {
                setRecoveryStatus('')
                try {
                  const m = await requirePassphrase(durationToMs(unlockDuration))
                  if (!m) { setRecoveryStatus('Passphrase required to view recovery phrase'); return }
                  setRecoveryPlain(m)
                  setRecoveryStatus('Keep these words offline. Do not share.')
                } catch (e: any) {
                  setRecoveryStatus(e?.message || 'Unable to load recovery phrase')
                }
              }}>Show recovery words</button>
              <button className="btn" onClick={() => { setRecoveryPlain(''); setRecoveryStatus('Hidden'); }}>Hide</button>
            </div>
            {recoveryPlain && (
              <div
                className="mono"
                style={{
                  background: 'var(--seed-bg)',
                  color: 'var(--seed-text)',
                  border: '1px solid var(--seed-border)',
                  padding: 12,
                  borderRadius: 8,
                  marginTop: 10,
                  lineHeight: 1.8,
                }}
              >
                {recoveryPlain}
              </div>
            )}
            {recoveryStatus && <div className="badge" style={{ marginTop: 8 }}>{recoveryStatus}</div>}
            <div className="note" style={{ marginTop: 12 }}>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                <li>Store the recovery words offline (paper or metal). Anyone with them can spend your funds.</li>
                <li>Do not screenshot or email them in Beginner mode.</li>
                <li>You can generate encrypted JSON/QR backups below once you set a passphrase.</li>
              </ul>
            </div>

            <div className="note mt-12">
              <div className="warn" style={{ marginBottom: 6 }}>Use at your own risk. Keep your seed safe.</div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Email
                <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmailState(e.target.value)} />
              </label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('Hello from One Currency (Mainnet)')
                  const body = encodeURIComponent('')
                  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`, '_blank')
                  setBackupStatus('Opened Gmail compose')
                }}>Open Gmail</button>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('Hello from One Currency (Mainnet)')
                  const body = encodeURIComponent('')
                  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
                  setBackupStatus('Opened mail app')
                }}>Open Mail App</button>
              </div>
              {backupStatus && <div className="badge" style={{ marginTop: 6 }}>{backupStatus}</div>}
            </div>

            <div className="note mt-12">
              <div className="kv" style={{ fontWeight: 600 }}>Encrypted Backup (JSON + QR)</div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Passphrase for encrypted backup
                <div className="row" style={{ gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <input
                    className="input"
                    type={showBackupPassphrase ? 'text' : 'password'}
                    form="noop-pass-form"
                    placeholder="Passphrase to encrypt backup"
                    value={backupPassphrase}
                    onChange={(e) => setBackupPassphrase(e.target.value)}
                  />
                  <button type="button" className="btn" onClick={() => setShowBackupPassphrase(v => !v)}>{showBackupPassphrase ? 'Hide' : 'Show'}</button>
                </div>
                <div className="subtle" style={{ marginTop: 4 }}>Required to generate encrypted backups.</div>
              </label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={async () => {
                  try {
                    const m = await unlockIfNeeded(durationToMs(unlockDuration))
                    if (!m) { setBackupStatus('No seed found'); return }
                    const pw = backupPassphrase.trim()
                    if (!pw) { setBackupStatus('Enter a backup passphrase'); return }
                    const json = await encryptMnemonic(m, pw)
                    setLastBackupJson(json)
                    setBackupStatus('Generated encrypted JSON + QR')
                  } catch (e: any) { setBackupStatus(e?.message || 'Failed to create encrypted backup') }
                }}>Generate</button>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  if (!lastBackupJson) { setBackupStatus('Generate backup first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('One Currency encrypted backup (Mainnet)')
                  const body = encodeURIComponent(`Encrypted backup (JSON):\n${lastBackupJson}\n\nA QR code was generated in the app. Download it and attach to this email if desired. Keep this email safe. You will need your passphrase to decrypt.`)
                  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`, '_blank')
                  setBackupStatus('Opened Gmail with encrypted backup JSON')
                }}>Email (Gmail)</button>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  if (!lastBackupJson) { setBackupStatus('Generate backup first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('One Currency encrypted backup (Mainnet)')
                  const body = encodeURIComponent(`Encrypted backup (JSON):\n${lastBackupJson}\n\nA QR code was generated in the app. Download it and attach to this email if desired. Keep this email safe. You will need your passphrase to decrypt.`)
                  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
                  setBackupStatus('Opened mail app with encrypted backup JSON')
                }}>Email (Default)</button>
              </div>
              {lastBackupJson && (
                <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
                  <QRCodeCanvas id="backup-qr-mainnet" value={lastBackupJson} size={180} includeMargin={true} />
                  <div className="row">
                    <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(lastBackupJson); setBackupStatus('Copied JSON to clipboard') } catch {} }}>Copy JSON</button>
                    <button className="btn" onClick={() => {
                      const canvas = document.getElementById('backup-qr-mainnet') as HTMLCanvasElement | null
                      if (!canvas) return
                      const url = canvas.toDataURL('image/png')
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'one-currency-mainnet-backup-qr.png'
                      a.click()
                    }}>Download QR</button>
                  </div>
                </div>
              )}
            </div>
          </WindowShell>
        </section>
      )}
      {tab === 'wallet' && (
        <section>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="kv">Wallet blocks</div>
            <button className="btn" onClick={() => setWalletReorder(v => !v)}>{walletReorder ? 'Lock order' : 'Reorder'}</button>
          </div>
          {walletReorder && (
            <div className="subtle" style={{ marginBottom: 8 }}>
              Drag blocks to reorder. Order is saved on this device.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            data-block="walletAddress"
            draggable={walletReorder}
            onDragStart={(e) => onDragStart(e, 'walletAddress')}
            onDragOver={onDragOver}
            onDrop={() => onDrop('walletAddress')}
            style={walletReorder ? { order: blockOrder('walletAddress'), border: '1px dashed rgba(148,163,184,0.35)', padding: 8, borderRadius: 10, cursor: 'move' } : { order: blockOrder('walletAddress') }}
          >
          <WindowShell id="walletAddress" title="Your Address">
            <div className="row" style={{ flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div className="kv">Index {addrIndex}</div>
                <div className="mono">{address}</div>
              </div>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(address) } catch {} }}>Copy</button>
                <button className="btn" onClick={async () => { const m = await unlockIfNeeded(durationToMs(unlockDuration)); if (!m) return; const addrReqId = ++addressReqRef.current; const next = incrementAddressIndex(); setAddrIndexState(next); const addr = await getAddress(m, next); if (addressReqRef.current !== addrReqId) return; setAddress(addr); await Promise.all([loadBalanceFor(addr), loadTxsFor(addr)]) }}>Generate New Address</button>
              </div>
            </div>
          </WindowShell>
          </div>

          <div
            data-block="walletBalance"
            draggable={walletReorder}
            onDragStart={(e) => onDragStart(e, 'walletBalance')}
            onDragOver={onDragOver}
            onDrop={() => onDrop('walletBalance')}
            style={walletReorder ? { order: blockOrder('walletBalance'), border: '1px dashed rgba(148,163,184,0.35)', padding: 8, borderRadius: 10, cursor: 'move' } : { order: blockOrder('walletBalance') }}
          >
          <WindowShell id="walletBalance" title="BTC Balance" className="mt-12">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn" onClick={toggleHideBalance}>{hideBalance ? 'Show' : 'Hide'}</button>
                <button id="balance-refresh" className="btn" onClick={refreshBalanceOnly} disabled={!address || balanceRefreshBusy}>
                {balanceRefreshBusy ? <span className="row"><span className="spinner spin"></span> Refreshing</span> : 'Refresh'}
              </button>
            </div>
            <div className={`cc-number ${hideBalance ? 'blurred' : ''}`} style={{ marginTop: 6 }}>
              {typeof displayBalance === 'number'
                ? `${formatAsCardDigits(((displayBalance / 1e8).toFixed(8)).replace(/0+$/, '').replace(/\.$/, ''))} BTC`
                : (balanceLoading ? 'Loading...' : '-')}
            </div>
            {balanceLoading && typeof displayBalance !== 'number' && (
              <div className="subtle" style={{ marginTop: 6 }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="spinner spin"></span>
                  Loading balance...
                </span>
              </div>
            )}
            <div className="kv" style={{ marginTop: 10 }}>Balance (sats)</div>
            <div className={`big ${hideBalance ? 'blurred' : ''}`}>
              {typeof displayBalance === 'number' ? displayBalance : (balanceLoading ? 'Loading...' : '-')}
            </div>
            {typeof displayBalance === 'number' ? (
              <div className={`kv ${hideBalance ? 'blurred' : ''}`} style={{ marginTop: 8 }}>
                ~ {btcFiat ? formatFiat(displayBalance * fiatPerSat, fiatCurrency) : `${fiatCurrency} n/a`}
              </div>
            ) : (
              balanceLoading ? <div className="kv" style={{ marginTop: 8 }}>~ USD n/a</div> : null
            )}
            {balanceErr && <div className="alert" style={{ marginTop: 8 }}>{balanceErr}</div>}
          </WindowShell>
          </div>

          <div
            data-block="satsReminder"
            draggable={walletReorder}
            onDragStart={(e) => onDragStart(e, 'satsReminder')}
            onDragOver={onDragOver}
            onDrop={() => onDrop('satsReminder')}
            style={walletReorder ? { order: blockOrder('satsReminder'), border: '1px dashed rgba(148,163,184,0.35)', padding: 8, borderRadius: 10, cursor: 'move' } : { order: blockOrder('satsReminder') }}
          >
          <SatsReminder />
          </div>
          <div
            data-block="converter"
            draggable={walletReorder}
            onDragStart={(e) => onDragStart(e, 'converter')}
            onDragOver={onDragOver}
            onDrop={() => onDrop('converter')}
            style={walletReorder ? { order: blockOrder('converter'), border: '1px dashed rgba(148,163,184,0.35)', padding: 8, borderRadius: 10, cursor: 'move' } : { order: blockOrder('converter') }}
          >
          <WindowShell id="converter" title="Real-time converter" className="mt-12">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div className="kv" style={{ fontWeight: 600 }}>{fiatCurrency} = BTC / sats</div>
              <div className="kv" style={{ whiteSpace: 'nowrap' }}>{getFiatLabel(fiatCurrency)}</div>
              <label style={{ minWidth: 220 }}>
                Display currency
                <select className="input" value={fiatCurrency} onChange={(e) => setFiatCurrencyState(e.target.value)}>
                  {SUPPORTED_FIAT.map((code) => (
                    <option key={code} value={code}>{`${FIAT_META[code]?.flag ? FIAT_META[code].flag + ' ' : ''}${FIAT_META[code]?.name || code} - ${code}`}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="kv" style={{ marginTop: 4 }}>Price source: {getPriceProviderLabel(priceProvider)} (auto-fallback) - {btcFiat ? formatFiat(btcFiat, fiatCurrency) : 'Loading...'}</div>
            <label style={{ display: 'block', marginTop: 8 }}>
              {fiatCurrency} amount
              <input className="input" type="number" min={0} step="0.01" value={convertUsd} onChange={(e) => setConvertUsd(e.target.value)} placeholder="100" />
            </label>
            {btcFiat && (
              <div className="kv" style={{ marginTop: 8 }}>
                {formatFiat(convertUsdNum, fiatCurrency)}
                {' '}= {(btcPerFiat * convertUsdNum).toFixed(8)} BTC = {fiatPerSat > 0 ? Math.round(convertUsdNum / fiatPerSat).toLocaleString() : '...'} sats
              </div>
            )}
            {!btcFiat && <div className="subtle" style={{ marginTop: 8 }}>Waiting for live price...</div>}
            <div className="kv" style={{ fontWeight: 600, marginTop: 12 }}>BTC = {fiatCurrency} / sats</div>
            <label style={{ display: 'block', marginTop: 8 }}>
              BTC amount
              <input className="input" type="number" min={0} step="0.00000001" value={convertBtc} onChange={(e) => setConvertBtc(e.target.value)} placeholder="0.005" />
            </label>
            {btcFiat && (
              <div className="kv" style={{ marginTop: 8 }}>
                {convertBtcNum.toFixed(8)} BTC = {formatFiat(convertBtcNum * btcFiat, fiatCurrency)} = {(Math.round(convertBtcNum * 1e8)).toLocaleString()} sats
              </div>
            )}
          </WindowShell>
          </div>
          <div
            data-block="addressHistory"
            draggable={walletReorder}
            onDragStart={(e) => onDragStart(e, 'addressHistory')}
            onDragOver={onDragOver}
            onDrop={() => onDrop('addressHistory')}
            style={walletReorder ? { order: blockOrder('addressHistory'), border: '1px dashed rgba(148,163,184,0.35)', padding: 8, borderRadius: 10, cursor: 'move' } : { order: blockOrder('addressHistory') }}
          >
          <WindowShell id="addressHistory" title={isAdvanced ? 'Addresses' : 'Address history'} className="mt-12">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  {!isAdvanced && <div className="subtle" style={{ marginTop: 4 }}>Reuse a previous address if funds were sent there.</div>}
                </div>
                <div className="row">
                  <button className="btn" onClick={() => { setAddrListOpen(v => !v); if (!addrListOpen) loadAddresses() }} aria-expanded={addrListOpen}>{addrListOpen ? 'Hide' : 'Show'}</button>
                  <button className="btn" onClick={loadAddresses} disabled={addrListLoading}>Reload</button>
                </div>
              </div>
              {addrListErr && <div className="alert" style={{ marginTop: 8 }}>{addrListErr}</div>}
              {addrListOpen && (
                <div className="scroll" style={{ marginTop: 8 }} onScroll={onAddrListScroll} ref={addrListScrollRef}>
                  {addrListLoading && <div className="subtle">Loading...</div>}
                  {!addrListLoading && (
                    <div>
                      {addrList.map(item => (
                        <div key={item.index} data-addr-index={item.index} data-addr={item.address} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                          <div>
                            <div className="kv">Index {item.index}</div>
                            <div className="mono" title={item.address} style={{ maxWidth: 560, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address}</div>
                          </div>
                          <div className="row">
                            <div className={`kv ${hideBalance ? 'blurred' : ''}`} style={{ marginRight: 8 }}>{typeof item.balance === 'number' ? `${item.balance} sats` : '...'}</div>
                            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(item.address) } catch {} }}>Copy</button>
                            <button className="btn btn-primary" onClick={async () => { const b = await selectAddress(item.index, item.address, item.balance); if (typeof b === 'number') setAddrList((prev) => prev.map((i) => (i.index === item.index ? { ...i, balance: b } : i))) }}>Use</button>
                          </div>
                        </div>
                      ))}
                      {addrListLoadingMore && <div className="subtle" style={{ marginTop: 6 }}>Loading more...</div>}
                      {addrListHasMore && !addrListLoadingMore && <div className="subtle" style={{ marginTop: 6 }}>Scroll to load more...</div>}
                    </div>
                  )}
                </div>
              )}
            </WindowShell>
          </div>

          <div
            data-block="recentActivity"
            draggable={walletReorder}
            onDragStart={(e) => onDragStart(e, 'recentActivity')}
            onDragOver={onDragOver}
            onDrop={() => onDrop('recentActivity')}
            style={walletReorder ? { order: blockOrder('recentActivity'), border: '1px dashed rgba(148,163,184,0.35)', padding: 8, borderRadius: 10, cursor: 'move' } : { order: blockOrder('recentActivity') }}
          >
          <WindowShell id="recentActivity" title="Transaction History" className="mt-12">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" onClick={() => setHistoryOpen(v => !v)} aria-expanded={historyOpen}>{historyOpen ? 'Hide' : 'Show'}</button>
                  <button id="txs-refresh" className="btn" onClick={refreshTxsOnly} disabled={!address || txsRefreshBusy}>
                  {txsRefreshBusy ? <span className="row"><span className="spinner spin"></span> Refreshing</span> : 'Refresh'}
                </button>
              </div>
            </div>
            {txsErr && <div className="alert" style={{ marginTop: 8 }}>{txsErr}</div>}
            {historyOpen && (
              <div className="scroll" style={{ marginTop: 8 }}>
                {txsLoading && <div className="subtle">Loading...</div>}
                {!txsLoading && (!txs.length ? (
                  <div className="subtle">No transactions yet.</div>
                ) : (
                  <div>
                    {txs.map((t) => {
                      const incoming = t.delta >= 0
                      const sign = incoming ? '+' : '-'
                      const amt = Math.abs(t.delta)
                      const when = t.time ? new Date(t.time * 1000).toLocaleString() : 'Unconfirmed'
                      return (
                        <div key={t.txid} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                          <div className={`mono ${hideBalance ? 'blurred' : ''}`} style={{ color: incoming ? '#86efac' : '#fca5a5' }}>{sign}{amt} sats</div>
                          <div className="subtle" title={t.txid}>{when}</div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </WindowShell>
          </div>
          </div>
        </section>
      )}

      {tab === 'buy' && <BuyBitcoin address={address} onRefresh={refresh} />}
      {tab === 'receive' && <Receive address={address} label="mainnet" />}
      {tab === 'send' && <SendMain fromAddress={address} onBroadcasted={refresh} requestPassphrase={async () => !!(await requirePassphrase(durationToMs(unlockDuration)))} />}
      {tab === 'merchant' && (() => {
        const selectedItem = merchantItems.find((i) => i.id === invoiceItemId) || merchantItems[0]
        const qty = Math.max(1, Math.floor(invoiceQty || 1))
        const usdTotal = selectedItem ? selectedItem.priceUsd * qty : 0
        const fiatTotal = fiatCurrency === 'USD' ? usdTotal : (usdToFiat > 0 ? usdTotal * usdToFiat : 0)
        const btcTotal = priceToBtc(usdTotal)
        const satsTotal = priceToSats(usdTotal)
        return (
          <section>
            <WindowShell id="merchantLive" title={`Live BTC/${fiatCurrency}`}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="big">{btcFiat ? `1 BTC = ${formatFiat(btcFiat, fiatCurrency)}` : 'Fetching rate...'}</div>
                  <div className="kv" style={{ marginTop: 4 }}>1 {fiatCurrency} = {btcPerFiat ? `${(btcPerFiat * 1e8).toFixed(0)} sats` : '...'} | 1,000 sats = {btcFiat ? formatFiat(fiatPerSat * 1000, fiatCurrency) : '...'} </div>
                  <div className="subtle" style={{ marginTop: 6 }}>Auto-refreshes every 20 minutes. BTC amounts update in real time for every item and invoice.</div>
                  <label style={{ display: 'block', marginTop: 8, maxWidth: 260 }}>
                    Display currency <span className="subtle" style={{ marginLeft: 6 }}>{getFiatLabel(fiatCurrency)}</span>
                    <select className="input" value={fiatCurrency} onChange={(e) => setFiatCurrencyState(e.target.value)}>
                      {SUPPORTED_FIAT.map((code) => (
                        <option key={code} value={code}>{`${FIAT_META[code]?.flag ? FIAT_META[code].flag + ' ' : ''}${FIAT_META[code]?.name || code} - ${code}`}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="note" style={{ maxWidth: 320 }}>
                  <div className="kv" style={{ fontWeight: 700, color: '#e2e8f0' }}>Merchant tools</div>
                  <div className="subtle" style={{ marginTop: 4 }}>Create a catalog, price items in USD, and generate payable BTC invoices with shareable BIP21 links and QR codes.</div>
                </div>
              </div>
            </WindowShell>

            <WindowShell id="merchantCatalog" title="Catalog" className="mt-12">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="kv">{merchantItems.length} items</div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <label style={{ flex: '1 1 240px' }}>
                  Item name
                  <input className="input" placeholder="e.g. Coffee" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
                </label>
                <label style={{ width: 180 }}>
                  Price (USD)
                  <input className="input" type="number" min={0} step="0.01" placeholder="4.50" value={newItemUsd} onChange={(e) => setNewItemUsd(e.target.value)} />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Description (optional)
                <textarea className="textarea" rows={2} placeholder="Size, toppings, warranty, etc." value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} />
              </label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-primary" onClick={addMerchantItem}>Save item</button>
                <span className="subtle">Prices convert to BTC instantly using the latest rate.</span>
              </div>
              {merchantItems.length > 0 && (
                <div className="scroll" style={{ marginTop: 10 }}>
                  {merchantItems.map((item) => {
                    const btc = priceToBtc(item.priceUsd)
                    const sats = priceToSats(item.priceUsd)
                    return (
                      <div key={item.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                        <div>                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div className="kv" style={{ marginTop: 4 }}>{item.description || 'No description'}</div>
                        </div>
                        <div className="row">
                          <div className="kv" style={{ textAlign: 'right' }}>
                            <div>
                      {formatFiat(item.priceUsd, 'USD')}</div>
                            {fiatCurrency !== 'USD' && usdToFiat > 0 && (
                              <div className="kv">{formatFiat(item.priceUsd * usdToFiat, fiatCurrency)}</div>
                            )}
                            <div>
                      {btc ? `${btc.toFixed(6)} BTC` : 'Loading price...'}</div>
                            <div>
                      {sats ? `${sats.toLocaleString()} sats` : ''}</div>
                          </div>
                          <button className="btn" style={{ marginLeft: 8 }} onClick={() => setInvoiceItemId(item.id)}>Invoice this</button>
                          <button className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => removeMerchantItem(item.id)}>Remove</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </WindowShell>

            <WindowShell id="merchantInvoice" title="Create BTC invoice" className="mt-12">
              <div className="row" style={{ marginTop: 8 }}>
                <label style={{ flex: '1 1 260px' }}>
                  Item
                  <select className="input" value={invoiceItemId} onChange={(e) => setInvoiceItemId(e.target.value)}>
                    {merchantItems.map((item) => {
                      const priceLabel = fiatCurrency !== 'USD' && usdToFiat > 0
                        ? `${formatFiat(item.priceUsd * usdToFiat, fiatCurrency)} · ${formatFiat(item.priceUsd, 'USD')}`
                        : formatFiat(item.priceUsd, 'USD')
                      return (
                        <option key={item.id} value={item.id}>{item.name} ({priceLabel})</option>
                      )
                    })}
                  </select>
                </label>
                <label style={{ width: 140 }}>
                  Quantity
                  <input className="input" type="number" min={1} value={invoiceQty} onChange={(e) => setInvoiceQty(Math.max(1, parseInt(e.target.value || '1', 10)))} />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Invoice note (optional)
                <textarea className="textarea" rows={2} placeholder="Customer name, order number, pickup time..." value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} />
              </label>
              <div className="kv" style={{ marginTop: 8 }}>
                Total due: {fiatTotal > 0 ? formatFiat(fiatTotal, fiatCurrency) : formatFiat(usdTotal, 'USD')}
                {fiatCurrency !== 'USD' && usdToFiat > 0 && ` (${formatFiat(usdTotal, 'USD')})`}
                {' '}| {btcTotal ? `${btcTotal.toFixed(6)} BTC` : 'Waiting for price'} ({satsTotal ? `${satsTotal.toLocaleString()} sats` : ''})
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={createInvoice} disabled={!btcPerUsd}>Generate invoice</button>
                <span className="subtle">Invoices pay to your current receiving address.</span>
                {invoiceStatus && <div className="badge">{invoiceStatus}</div>}
              </div>
            </WindowShell>

            {invoices.length > 0 && (
              <WindowShell id="merchantInvoices" title="Invoices" className="mt-12">
                <div className="scroll" style={{ marginTop: 8 }}>
                  {invoices.map((inv) => {
                    const item = merchantItems.find((i) => i.id === inv.itemId)
                    return (
                      <div key={inv.id} className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                        <div style={{ flex: '1 1 60%', minWidth: 240 }}>
                          <div style={{ fontWeight: 600 }}>{item?.name || 'Item'}</div>
                          <div className="kv">
                            Qty {inv.qty} | {fiatCurrency !== 'USD' && usdToFiat > 0
                              ? `${formatFiat(inv.usdTotal * usdToFiat, fiatCurrency)} (${formatFiat(inv.usdTotal, 'USD')})`
                              : formatFiat(inv.usdTotal, 'USD')}
                            {' '}| {inv.btcAmount.toFixed(6)} BTC ({inv.sats.toLocaleString()} sats)
                          </div>
                          {inv.note && <div className="kv" style={{ marginTop: 4 }}>Note: {inv.note}</div>}
                          <div className="mono" style={{ marginTop: 6, wordBreak: 'break-all' }}>{inv.bip21}</div>
                          <div className="row" style={{ marginTop: 6 }}>
                            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(inv.bip21); setInvoiceStatus('Copied BIP21 invoice link'); } catch {} }}>Copy BIP21</button>
                            <button className="btn" onClick={() => { try { window.open(inv.bip21, '_blank') } catch {} }}>Open payment link</button>
                          </div>
                        </div>
                        <div className="qr-wrap">
                          <QRCodeCanvas value={inv.bip21} size={132} includeMargin={true} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </WindowShell>
            )}
          </section>
        )
      })()}
      {tab === 'downloads' && <Downloads />}
      {tab === 'refer' && <Referral />}
      {tab === 'lookup' && (
        <WindowShell id="lookup" title="Bitcoin Lookup">
          <p className="subtle" style={{ marginTop: 4 }}>
            Look up addresses, transaction ids, or block height on mainnet or testnet.
          </p>
          <div className="row" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
            <label style={{ minWidth: 200 }}>
              Lookup type
              <select className="input" value={lookupType} onChange={(e) => {
                const next = e.target.value as LookupType
                setLookupType(next)
                resetLookupResults()
                setLookupErr(null)
                if (next === 'address') {
                  setLookupNetwork(detectLookupNetwork(lookupQuery))
                } else {
                  setLookupNetwork(lookupNetChoice)
                }
              }}>
                <option value="address">Address</option>
                <option value="txid">Transaction id</option>
                <option value="block">Block height</option>
              </select>
            </label>
            {lookupType !== 'address' && (
              <label style={{ minWidth: 160 }}>
                Network
                <select className="input" value={lookupNetChoice} onChange={(e) => {
                  const next = e.target.value as LookupNetChoice
                  setLookupNetChoice(next)
                  setLookupNetwork(next)
                }}>
                  <option value="mainnet">Mainnet</option>
                  <option value="testnet">Testnet</option>
                </select>
              </label>
            )}
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            {lookupType === 'address' ? 'Address' : lookupType === 'txid' ? 'Transaction id' : 'Block height'}
            <input className="input" placeholder={
              lookupType === 'address'
                ? 'bc1..., 1..., 3..., tb1..., m/n..., or 2...'
                : lookupType === 'txid'
                  ? '64-character transaction id'
                  : 'Block height (e.g. 800000)'
            } value={lookupQuery} onChange={(e) => {
              const next = e.target.value
              setLookupQuery(next)
              if (lookupType === 'address') setLookupNetwork(detectLookupNetwork(next))
            }} />
          </label>
            <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={loadLookup} disabled={lookupLoading}>
                {lookupLoading ? 'Searching...' : 'Search'}
              </button>
              {lookupType === 'address' && (
                <button className="btn" onClick={() => setLookupScanOpen(true)}>Scan QR</button>
              )}
              {lookupType !== 'block' && (
                <button className="btn" onClick={() => setLookupShowUsd((v) => !v)}>
                  Show in {lookupShowUsd ? 'BTC' : fiatCurrency}
                </button>
              )}
            <span className="subtle">
              {lookupType === 'address'
                ? `Detected: ${lookupNetwork === 'unknown' ? 'Unknown' : lookupNetwork}`
                : `Network: ${lookupNetChoice}`}
            </span>
          </div>
          {lookupErr && <div className="alert" style={{ marginTop: 10 }}>{lookupErr}</div>}
          {lookupInfo && (
            <div className="note" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div className="kv">Balance</div>
                  <div style={{ fontWeight: 700 }}>{renderAmount(lookupInfo.balanceSats)}</div>
                  <div className="subtle">Confirmed: {renderAmount(lookupInfo.confirmedSats)}</div>
                  <div className="subtle">Mempool: {renderAmount(lookupInfo.mempoolSats)}</div>
                </div>
                <div>
                  <div className="kv">Totals</div>
                  <div className="subtle">Received: {renderAmount(lookupInfo.totalReceivedSats)}</div>
                  <div className="subtle">Sent: {renderAmount(lookupInfo.totalSentSats)}</div>
                </div>
                <div>
                  <div className="kv">Transactions</div>
                  <div className="subtle">Confirmed: {lookupInfo.txCount}</div>
                  <div className="subtle">Mempool: {lookupInfo.mempoolTxCount}</div>
                </div>
              </div>
            </div>
          )}
          {lookupTxInfo && (
            <div className="note" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 240 }}>
                  <div className="kv">Transaction</div>
                  <div className="mono" style={{ wordBreak: 'break-all' }}>{lookupTxInfo.txid}</div>
                </div>
                <div>
                  <div className="kv">Status</div>
                  <div className="subtle">{lookupTxInfo.confirmed ? 'Confirmed' : 'Pending'}</div>
                  <div className="subtle">
                    {lookupTxInfo.blockTime ? new Date(lookupTxInfo.blockTime * 1000).toLocaleString() : 'Unconfirmed'}
                  </div>
                </div>
                <div>
                  <div className="kv">Block</div>
                  <div className="subtle">{lookupTxInfo.blockHeight ?? 'Unknown'}</div>
                </div>
                <div>
                  <div className="kv">Fee</div>
                  <div className="subtle">{lookupTxInfo.feeSats !== null ? renderAmount(lookupTxInfo.feeSats) : 'Unknown'}</div>
                </div>
                <div>
                  <div className="kv">vsize</div>
                  <div className="subtle">{lookupTxInfo.vsize ?? 'Unknown'}</div>
                </div>
              </div>
            </div>
          )}
          {lookupBlockInfo && (
            <div className="note" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 240 }}>
                  <div className="kv">Block hash</div>
                  <div className="mono" style={{ wordBreak: 'break-all' }}>{lookupBlockInfo.hash}</div>
                </div>
                <div>
                  <div className="kv">Height</div>
                  <div className="subtle">{lookupBlockInfo.height}</div>
                </div>
                <div>
                  <div className="kv">Timestamp</div>
                  <div className="subtle">
                    {lookupBlockInfo.timestamp ? new Date(lookupBlockInfo.timestamp * 1000).toLocaleString() : 'Unknown'}
                  </div>
                </div>
                <div>
                  <div className="kv">Transactions</div>
                  <div className="subtle">{lookupBlockInfo.txCount ?? 'Unknown'}</div>
                </div>
                <div>
                  <div className="kv">Size</div>
                  <div className="subtle">{lookupBlockInfo.size ?? 'Unknown'}</div>
                </div>
                <div>
                  <div className="kv">Weight</div>
                  <div className="subtle">{lookupBlockInfo.weight ?? 'Unknown'}</div>
                </div>
              </div>
            </div>
          )}
          {lookupType === 'address' && (
            <div className="surface-soft mt-12" style={{ lineHeight: 1.6 }}>
              <div className="kv" style={{ fontWeight: 600 }}>Transaction History</div>
              {lookupLoading && <div className="subtle" style={{ marginTop: 6 }}>Loading transactions...</div>}
              {!lookupLoading && !lookupTxs.length && <div className="subtle" style={{ marginTop: 6 }}>No transactions loaded yet.</div>}
              {!!lookupTxs.length && (
                <div style={{ marginTop: 8 }}>
                  {lookupTxs.slice(0, 50).map((t) => {
                    const deltaAbs = Math.abs(t.delta)
                    const deltaLabel = lookupShowUsd
                      ? `${t.delta >= 0 ? '+' : '-'}${formatFiatFromSats(deltaAbs)}`
                      : `${t.delta >= 0 ? '+' : '-'}${formatBtc(deltaAbs)} BTC`
                    return (
                      <div key={t.txid} className="row" style={{ justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                        <div>
                          <div className="kv" style={{ fontSize: 13 }}>{t.txid.slice(0, 10)}...{t.txid.slice(-8)}</div>
                          <div className="subtle">
                            {t.time ? new Date(t.time * 1000).toLocaleString() : 'Unconfirmed'} | {t.confirmed ? 'Confirmed' : 'Pending'}
                          </div>
                        </div>
                        <div style={{ fontWeight: 600 }}>{deltaLabel}</div>
                      </div>
                    )
                  })}
                  {lookupTxs.length > 50 && (
                    <div className="subtle" style={{ marginTop: 8 }}>
                      Showing first 50 transactions. Refine search if you need more.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </WindowShell>
      )}
      <QrScanner
        open={lookupScanOpen}
        onClose={() => setLookupScanOpen(false)}
        onResult={(v) => {
          const parsed = parseLookupAddress(v)
          if (!parsed) {
            setLookupErr('No address found in QR.')
            setLookupScanOpen(false)
            return
          }
          setLookupType('address')
          setLookupQuery(parsed)
          setLookupNetwork(detectLookupNetwork(parsed))
          resetLookupResults()
          setLookupErr(null)
          setLookupScanOpen(false)
        }}
        title="Scan Address QR"
        helperText="Point your camera at a Bitcoin address QR. We will fill the lookup field for you."
      />
      {tab === 'privacy' && (
        <section>
          <WindowShell id="privacy" title="Privacy & Compliance">
            <p className="subtle" style={{ marginTop: 6 }}>
              Your keys, your bitcoin. OneCurrency is a non-custodial wallet: your recovery phrase and passphrase stay on your devices. We do not take possession of funds, do not provide banking, and are not FDIC/NCUA insured.
            </p>
            <div className="note" style={{ marginTop: 10, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>Core principles</div>
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                <li>Keys & recovery stay local; you control encryption and backups.</li>
                <li>No telemetry or ads. Bitcoin data requests go to public Bitcoin APIs. Preparing a purchase also shares your delivery address and IP address with the funding service and MoonPay.</li>
                <li>Wallet creation keeps keys local. Optional Bitcoin purchases require identity verification with the purchase provider.</li>
              </ul>
            </div>
            <div className="note" style={{ marginTop: 10, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>Compliance notice</div>
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                <li>Use is subject to your local laws and tax rules. You are responsible for reporting and compliance.</li>
                <li>We do not provide financial, legal, or tax advice. Bitcoin transactions are irreversible.</li>
                <li>Software provided 'as is' without warranties. Always test with small amounts first.</li>
              </ul>
            </div>
            <div className="note" style={{ marginTop: 10, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>Privacy controls</div>
              <p className="subtle" style={{ marginTop: 4 }}>Hide your BTC balance on this device.</p>
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn" onClick={toggleHideBalance}>{hideBalance ? 'Show Balance' : 'Hide Balance'}</button>
              </div>
            </div>
          </WindowShell>
        </section>
      )}
      {tab === 'support' && (
        <section>
          <WindowShell id="support" title="Help & Support">
            <label style={{ display: 'block', marginTop: 8 }}>
              Subject
              <input className="input" id="support-subject" type="text" defaultValue="Support Request" />
            </label>
            <label style={{ display: 'block', marginTop: 8 }}>
              Message
              <textarea className="textarea" id="support-body" rows={4} placeholder="Describe your issue... (address auto-included)"></textarea>
            </label>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => {
                const subject = (document.getElementById('support-subject') as HTMLInputElement)?.value || 'Support Request'
                const bodyUser = (document.getElementById('support-body') as HTMLTextAreaElement)?.value || ''
                const details = [`Address: ${address}`, 'Network: Mainnet']
                const body = `${bodyUser}\n\n---\n${details.join('\n')}`.trim()
                const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent('info@onecurrency.net')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
                window.open(url, '_blank')
              }}>Email Support (Gmail)</button>
            </div>
          </WindowShell>
        </section>
      )}

      {tab === 'settings' && (
        <section>
          <WindowShell id="settings" title="Settings" bodyClassName="window-body-stack">
            <p><strong>Network:</strong> Mainnet (real BTC)</p>
            <label style={{ display: 'block', marginTop: 8 }}>
              {t('settings.language')}
              <select className="input" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} data-i18n-skip>
                {supported.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginTop: 8 }}>
              Address type
              <select className="input" value={addrType} onChange={(e) => { const v = e.target.value as AddressType; setAddrType(v); setAddressType(v); setPrefStatus('Saved address type'); }}>
                <option value="native-segwit">Native SegWit (BIP84, bech32 bc1...)</option>
                <option value="nested-segwit">Nested SegWit (BIP49, P2SH 3...)</option>
                <option value="legacy">Legacy (BIP44, P2PKH 1...)</option>
                <option value="taproot">Taproot (BIP86, bech32m bc1p...)</option>
              </select>
            </label>
            <label style={{ display: 'block', marginTop: 8 }}>
              Price provider
              <select className="input" value={priceProvider} onChange={(e) => { const v = e.target.value as PriceProvider; setPriceProvider(v); setPriceProviderState(v); setPrefStatus('Saved price provider'); }}>
                {PRICE_PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} - {opt.scope}
                  </option>
                ))}
              </select>
              <div className="subtle" style={{ marginTop: 4 }}>If a provider is unavailable or doesn’t support your currency, we auto-fallback to the next one.</div>
            </label>
            <div className="note mt-12">
              <WalletStyleEditor />
            </div>
            <div className="note mt-12">
              <div className="warn" style={{ marginBottom: 6 }}>Use at your own risk. Keep your seed safe.</div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Email
                <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmailState(e.target.value)} />
              </label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('Hello from One Currency (Mainnet)')
                  const body = encodeURIComponent('')
                  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`, '_blank')
                  setBackupStatus('Opened Gmail compose')
                }}>Open Gmail</button>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('Hello from One Currency (Mainnet)')
                  const body = encodeURIComponent('')
                  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
                  setBackupStatus('Opened mail app')
                }}>Open Mail App</button>
              </div>
              {backupStatus && <div className="badge" style={{ marginTop: 6 }}>{backupStatus}</div>}
            </div>

            <div className="note mt-12">
              <div className="kv" style={{ fontWeight: 600 }}>Encrypted Backup (JSON + QR)</div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Passphrase for encrypted backup
                <div className="row" style={{ gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <input
                    className="input"
                    type={showBackupPassphrase ? 'text' : 'password'}
                    form="noop-pass-form"
                    placeholder="Passphrase to encrypt backup"
                    value={backupPassphrase}
                    onChange={(e) => setBackupPassphrase(e.target.value)}
                  />
                  <button type="button" className="btn" onClick={() => setShowBackupPassphrase(v => !v)}>{showBackupPassphrase ? 'Hide' : 'Show'}</button>
                </div>
                <div className="subtle" style={{ marginTop: 4 }}>Required to generate encrypted backups.</div>
              </label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={async () => {
                  try {
                    const m = await unlockIfNeeded(durationToMs(unlockDuration))
                    if (!m) { setBackupStatus('No seed found'); return }
                    const pw = backupPassphrase.trim()
                    if (!pw) { setBackupStatus('Enter a backup passphrase'); return }
                    const json = await encryptMnemonic(m, pw)
                    setLastBackupJson(json)
                    setBackupStatus('Generated encrypted JSON + QR')
                  } catch (e: any) { setBackupStatus(e?.message || 'Failed to create encrypted backup') }
                }}>Generate</button>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  if (!lastBackupJson) { setBackupStatus('Generate backup first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('One Currency encrypted backup (Mainnet)')
                  const body = encodeURIComponent(`Encrypted backup (JSON):\n${lastBackupJson}\n\nA QR code was generated in the app. Download it and attach to this email if desired. Keep this email safe. You will need your passphrase to decrypt.`)
                  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`, '_blank')
                  setBackupStatus('Opened Gmail with encrypted backup JSON')
                }}>Email (Gmail)</button>
                <button className="btn" onClick={() => {
                  if (!email) { setBackupStatus('Enter an email first'); return }
                  if (!lastBackupJson) { setBackupStatus('Generate backup first'); return }
                  const to = encodeURIComponent(email)
                  const subject = encodeURIComponent('One Currency encrypted backup (Mainnet)')
                  const body = encodeURIComponent(`Encrypted backup (JSON):\n${lastBackupJson}\n\nA QR code was generated in the app. Download it and attach to this email if desired. Keep this email safe. You will need your passphrase to decrypt.`)
                  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
                  setBackupStatus('Opened mail app with encrypted backup JSON')
                }}>Email (Default)</button>
              </div>
              {lastBackupJson && (
                <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
                  <QRCodeCanvas id="backup-qr-mainnet" value={lastBackupJson} size={180} includeMargin={true} />
                  <div className="row">
                    <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(lastBackupJson); setBackupStatus('Copied JSON to clipboard') } catch {} }}>Copy JSON</button>
                    <button className="btn" onClick={() => {
                      const canvas = document.getElementById('backup-qr-mainnet') as HTMLCanvasElement | null
                      if (!canvas) return
                      const url = canvas.toDataURL('image/png')
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'one-currency-mainnet-backup-qr.png'
                      a.click()
                    }}>Download QR</button>
                  </div>
                </div>
              )}
          </div>

          <WindowShell id="backupRestore" title="Restore Encrypted Backup" className="mt-12" style={{ lineHeight: 1.6 }}>
            <label style={{ display: 'block', marginTop: 8 }}>
              Encrypted JSON
              <textarea className="textarea" rows={4} placeholder='Paste your backup JSON here' value={restoreJson} onChange={(e) => setRestoreJson(e.target.value)} />
            </label>
            <label style={{ display: 'block', marginTop: 8 }}>
              Backup password (used to decrypt)
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input className="input" type={showRestorePw ? 'text' : 'password'} form="noop-pass-form" placeholder='Password set when you created the backup' value={restorePw} onChange={(e) => setRestorePw(e.target.value)} />
                <button type="button" className="btn" onClick={() => setShowRestorePw(v => !v)}>{showRestorePw ? 'Hide' : 'Show'}</button>
              </div>
              <div className="subtle" style={{ marginTop: 4 }}>You only need this one password to decrypt JSON or QR backups.</div>
            </label>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => setScanOpen(true)}>Scan QR</button>
              <label className="btn" style={{ cursor: 'pointer' }}>
                Upload QR Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
              try {
                // @ts-ignore
                const BD = (window as any).BarcodeDetector
                if (!BD) { setRestoreStatus('BarcodeDetector not supported. Paste JSON instead.'); return }
                const file = e.target.files && e.target.files[0]
                if (!file) return
                const imgBitmap = await createImageBitmap(file)
                const detector = new BD({ formats: ['qr_code'] })
                const codes = await detector.detect(imgBitmap)
                if (codes && codes.length) {
                  const v = codes[0].rawValue || ''
                  if (v) { setRestoreJson(v); setRestoreStatus('Scanned QR from image') }
                } else {
                  setRestoreStatus('No QR code found in image')
                }
              } catch (err: any) {
                setRestoreStatus(err?.message || 'Failed to scan image')
              }
                }} />
              </label>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={async () => {
                setRestoreStatus('')
                try {
                  if (!restoreJson.trim() || !restorePw) { setRestoreStatus('Enter JSON and password'); return }
                  const m = await decryptMnemonic(restoreJson.trim(), restorePw)
                  if (!hasValidWordCount(m)) { setRestoreStatus(`Decryption succeeded but phrase has ${countWords(m)} words and is not a supported recovery phrase`); return }
                  const words = m.split(' ')
                  const preview = `${words.slice(0,2).join(' ')} ... ${words.slice(-2).join(' ')}`
                  setRestoreStatus(`Looks good: ${preview}`)
                } catch (e: any) {
                  setRestoreStatus(e?.message || 'Failed to decrypt backup')
                }
              }}>Validate Only</button>
              <button className="btn btn-primary" onClick={async () => {
                setRestoreStatus('')
                try {
                  if (!restoreJson.trim() || !restorePw) { setRestoreStatus('Enter JSON and password'); return }
                  const m = await decryptMnemonic(restoreJson.trim(), restorePw)
                  if (!hasValidWordCount(m)) { setRestoreStatus(`Decryption succeeded but phrase has ${countWords(m)} words and is not a supported recovery phrase`); return }
                  await saveMnemonic(m, restorePw, durationToMs(unlockDuration))
                  await refresh()
                  setRestoreStatus('Decrypted and imported wallet')
                } catch (e: any) {
                  setRestoreStatus(e?.message || 'Failed to decrypt backup')
                }
              }}>Decrypt & Import</button>
            </div>
            {restoreStatus && <div className="badge" style={{ marginTop: 6 }}>{restoreStatus}</div>}
          </WindowShell>
          <WindowShell id="signMessage" title="Sign Message (Mainnet)" className="mt-12" style={{ lineHeight: 1.6, display: 'none' }}>
            <div className="kv">Signing address index: {addrIndex}</div>
            <div className="subtle" style={{ marginTop: 6 }}>Please provide a message signature to confirm access to your wallet address.</div>
            <ol style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Open your wallet application.</li>
              <li>Enter your wallet address in the signing tool.</li>
              <li>Copy the message below and paste it into your wallet's signing field.</li>
              <li>Sign the message and paste the resulting signature in the section below.</li>
            </ol>
            <label style={{ display: 'block', marginTop: 8 }}>
              Wallet address
              <input className="input" value={address} readOnly />
            </label>
            <label style={{ display: 'block', marginTop: 8 }}>
              Message to sign
              <textarea className="textarea" rows={2} readOnly value={proofMsg} />
            </label>
            {proofHashHex && <div className="kv" style={{ marginTop: 6 }}>BTC Signed Message Hash (hex): {proofHashHex}</div>}
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" onClick={() => { try { navigator.clipboard.writeText(proofMsg) } catch {} }}>Copy Message</button>
              <button className="btn" onClick={genProofMsg}>Generate New</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={onSign}>Sign Message (here)</button>
              <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(address) } catch {} }}>Copy Address</button>
            </div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Uses standard Bitcoin Signed Message hashing and base64 compact signatures. Compatible with bitcoin-cli verifymessage.
            </div>
          </WindowShell>

          <WindowShell id="addressProof" title="Add Signature Address Proof (Mainnet)" className="mt-12" style={{ lineHeight: 1.6, display: 'none' }}>
            <div className="subtle">Please provide a message signature to confirm access to your wallet address.</div>
            <ol style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Open your wallet application.</li>
              <li>Enter your wallet address in the signing tool.</li>
              <li>Copy the message below and paste it into your wallet's signing field.</li>
              <li>Sign the message and paste the resulting signature.</li>
            </ol>
            <label style={{ display: 'block', marginTop: 8 }}>
              Wallet address
              <input className="input" value={proofAddress} onChange={(e) => setProofAddress(e.target.value)} placeholder="bc1..." />
            </label>
            <label style={{ display: 'block', marginTop: 8 }}>
              Message to sign
              <textarea className="textarea" rows={2} readOnly value={proofMsg} />
            </label>
            {proofHashHex && <div className="kv" style={{ marginTop: 6 }}>BTC Signed Message Hash (hex): {proofHashHex}</div>}
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" onClick={() => { try { navigator.clipboard.writeText(proofMsg) } catch {} }}>Copy Message</button>
              <button className="btn" onClick={genProofMsg}>Generate New</button>
            </div>
            <label style={{ display: 'block', marginTop: 8 }}>
              Signature (base64)
              <textarea className="textarea" rows={3} value={proofSig} onChange={(e) => setProofSig(e.target.value)} placeholder="Paste signature here" />
            </label>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => {
                if (!proofAddress || !proofMsg || !proofSig) { setProofStatus('Fill address, message, and signature.'); return }
                setProofStatus('Proof submitted. (Verification coming with Legacy/BIPâ€‘322)')
              }}>Submit Proof</button>
              <button className="btn" onClick={() => { setProofSig(''); setProofStatus(''); }}>Clear</button>
            </div>
            {proofStatus && <div className="badge" style={{ marginTop: 6 }}>{proofStatus}</div>}
          </WindowShell>
          {qrScanner}

            <div className="note mt-12">
              <div className="kv" style={{ fontWeight: 600 }}>Tip preferences</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input type="checkbox" checked={showTipPref} onChange={(e) => setShowTipPref(e.target.checked)} /> Show tip input on Send
              </label>
              <label style={{ display: 'block', marginTop: 8 }}>
                Default tip (sats)
                <input className="input" type="number" min={0} step={1} value={defaultTipPref} onChange={(e) => setDefaultTipPref(e.target.value)} />
              </label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => {
                  setShowTip(showTipPref)
                  const n = Math.max(0, Math.floor(parseInt(defaultTipPref || '0', 10) || 0))
                  setDefaultTip(n)
                  setPrefStatus('Saved tip preferences')
                }}>Save Preferences</button>
                {prefStatus && <div className="badge">{prefStatus}</div>}
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={testConnection}>Test Connection</button>
              <span className="subtle">{conn}</span>
            </div>
            <div className="mt-12">
              <button className="btn btn-danger" onClick={onOpenWipe}>Wipe Wallet</button>
            </div>
          </WindowShell>
        </section>
      )}

      {tab === 'credit' && <CreditUnion network="mainnet" />}
      {tab === 'faucet' && (
        <section>
          <WindowShell id="faucet" title="OneCurrency Faucet">
            <p className="subtle" style={{ marginTop: 6 }}>
              Claim sats from the OneCurrency faucet. Withdraw when you reach the minimum threshold.
            </p>
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <a className="btn btn-primary" href="https://onecurrency.net/onefaucet/" target="_blank" rel="noreferrer">Open Faucet</a>
              <button className="btn" onClick={() => setTab('wallet')}>Back to Wallet</button>
            </div>
          </WindowShell>
        </section>
      )}

      {/* Faucet banner */}
      <WindowShell id="faucetBanner" title="Claim free sats" className="mt-12" style={{ borderLeft: '4px solid #22d3ee' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p className="subtle" style={{ marginTop: 4, maxWidth: 640 }}>
              Promote OneCurrency and stack sats hourly. Fast claims, captcha protected, withdraw once you hit 30,000 sats.
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-primary" href="/onefaucet/index.html" target="_blank" rel="noreferrer">Open Faucet</a>
            <button className="btn" onClick={() => setAboutOpen(true)}>About OneCurrency</button>
          </div>
        </div>
      </WindowShell>

      <VRWallet
        open={vrOpen}
        onClose={() => setVrOpen(false)}
        priceUsd={btcUsd}
        balanceSats={balance}
        address={address || 'Loadingâ€¦'}
        networkLabel={conn || 'Mainnet'}
      />

      {creditNoticeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { setCreditNoticeOpen(false); setTab('wallet') }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}
        >
          <div onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
            <WindowShell id="creditNotice" title="Credit Union Update" style={{ width: 'min(720px, 94vw)', lineHeight: 1.6 }}>
              <p className="subtle" style={{ marginTop: 4 }}>
                Credit union plans are paused while we focus on non-custodial tools. This keeps the app clear and avoids confusion.
              </p>
              <div className="tweet-card" style={{ marginTop: 12 }}>
                <div className="tweet-header">
                  <div className="tweet-author">
                    <div className="tweet-avatar" aria-hidden="true"></div>
                    <div>                      <div className="tweet-name">OneCurrency</div>
                      <div className="tweet-handle">@onecurrency1</div>
                    </div>
                  </div>
                  <div className="tweet-x">X</div>
                </div>
                <div className="tweet-body">
                  #OneCurrency is global #bitcoin software, not a bank. We do not custody user funds. To keep things compliant and fair for our worldwide users, we are pausing U.S.-only credit union ideas while we focus on building non-custodial tools for everyone. More soon.
                </div>
                <div className="tweet-preview">
                  <div className="tweet-preview-media" aria-hidden="true"></div>
                  <div>
                    <div className="tweet-preview-host">onecurrency.net</div>
                    <div className="tweet-preview-title">OneCurrency - a non-custodial Bitcoin wallet for self-custody</div>
                    <div className="tweet-preview-desc">Self-custody Bitcoin wallet. Proposed credit union formation (not yet chartered or insured). Fee per send transaction.</div>
                  </div>
                </div>
                <div className="tweet-meta">6:03 PM - Dec 18, 2025</div>
              </div>
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <a className="btn btn-primary" href="https://x.com/onecurrency1/status/2001790375611244831" target="_blank" rel="noreferrer">View on X</a>
                <button className="btn" onClick={() => { setCreditNoticeOpen(false); setTab('wallet') }}>Got it</button>
              </div>
            </WindowShell>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <WindowShell id="aboutOneCurrency" title="About OneCurrency" style={{ width: 'min(720px, 94vw)', lineHeight: 1.6 }}>
            <p className="subtle" style={{ marginTop: 4 }}>
              OneCurrency is a non-custodial Bitcoin wallet built for retail and builders. We keep recovery simple, pricing live, and UX fast so you can accept BTC without confusing your staff or customers.
            </p>
            <p className="subtle" style={{ marginTop: 8 }}>
              We provide non-custodial Bitcoin transaction software. Users broadcast their own transactions. We never custody funds, route fiat, or intermediate value.
            </p>
            <ul style={{ marginTop: 10, paddingLeft: 18, color: '#cbd5e1' }}>
              <li>Instant wallet setup with local keys. Optional purchases use a separate provider with identity verification.</li>
              <li>Real-time Blockstream mempool data for pricing, fees, and monitoring.</li>
              <li>Multi-address support, QR invoices, and encrypted backups for peace of mind.</li>
              <li>Browser-friendly flows so you can create invoices even on spotty Wi-Fi.</li>
              <li>Developer-first: easy export, testnet tools, and transparent APIs.</li>
            </ul>
            <div className="note" style={{ marginTop: 10 }}>
              <div className="kv">What makes us different?</div>
              <div className="subtle" style={{ marginTop: 4 }}>
                We combine simple onboarding with full ownership. No lock-in, no surprisesâ€”just reliable pricing, clear invoices, and backups you control.
              </div>
            </div>
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setAboutOpen(false)}>Close</button>
            </div>
          </WindowShell>
        </div>
      )}

      {wipeConfirmOpen && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <WindowShell id="wipeConfirmMainnet" title="Sweep Funds Before Wipe?" style={{ width: 'min(560px, 92vw)' }}>
            <div className="kv">Your wallet has a balance. You can sweep all spendable sats to a safe address before wiping.</div>
            <label style={{ display: 'block', marginTop: 8 }}>
              Destination (mainnet)
              <input className="input" placeholder="bc1... or 1... or 3..." value={sweepDest} onChange={(e) => setSweepDest(e.target.value)} />
            </label>
            {sweepErr && <div className="alert" style={{ marginTop: 8 }}>{sweepErr}</div>}
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setWipeConfirmOpen(false)} disabled={sweepBusy}>Cancel</button>
              <button className="btn" onClick={async () => { setWipeConfirmOpen(false); if (confirm('Wipe wallet without sweeping funds? This cannot be undone.')) await onWipeWithAuth() }} disabled={sweepBusy}>Wipe Without Sweep</button>
              <button className="btn btn-primary" onClick={onSweepAndWipe} disabled={sweepBusy}>{sweepBusy ? 'Sweeping...' : 'Sweep & Wipe'}</button>
            </div>
          </WindowShell>
        </div>
      )}
    </div>
  )
}



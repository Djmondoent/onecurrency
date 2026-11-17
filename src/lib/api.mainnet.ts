import axios from 'axios'

const PRIMARY = 'https://blockstream.info/api'
const BACKUP = 'https://mempool.space/api'

const DEFAULT_BASE = PRIMARY

let BASE = DEFAULT_BASE
export function setApiBase(url: string) { BASE = url.replace(/\/$/, '') }
export function getApiBase() { return BASE }

const MEMPOOL_BASE = 'https://mempool.space/api'
const ADDR_CACHE_MS = 60 * 1000
const ADDR_COOLDOWN_MS = 5 * 60 * 1000
const REQUEST_GAP_MS = 300
type Cached<T> = { t: number, v: T }
const inflight = new Map<string, Promise<any>>()
const cache = new Map<string, Cached<any>>()
const failUntil = new Map<string, number>()
let lastRequestAt = 0
let requestGate = Promise.resolve()
const AXIOS_OPTS = { timeout: 8000 }

function getCached<T>(key: string, maxAge: number): T | null {
  const entry = cache.get(key) as Cached<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.t > maxAge) return null
  return entry.v
}

function setCached<T>(key: string, v: T) {
  cache.set(key, { t: Date.now(), v })
}

async function fetchCachedWithFallback<T>(key: string, urls: string[], maxAge: number, force: boolean = false): Promise<T> {
  if (!force) {
    const existing = getCached<T>(key, maxAge)
    if (existing) return existing
  }

  if (inflight.has(key)) return inflight.get(key) as Promise<T>

  const p = (async () => {
    let lastErr: any = null
    try {
      for (const url of urls) {
        const urlKey = `${key}:${url}`
        const nextAllowed = failUntil.get(urlKey) || 0
        if (nextAllowed && Date.now() < nextAllowed) continue
        try {
          await (requestGate = requestGate.then(async () => {
            const wait = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt))
            if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
            lastRequestAt = Date.now()
          }).catch(() => {}))
          const { data } = await axios.get(url, AXIOS_OPTS)
          setCached(key, data)
          return data as T
        } catch (e: any) {
          lastErr = e
          const status = e?.response?.status
          if (status === 429) {
            const retryAfter = Number(e?.response?.headers?.['retry-after'] || 0)
            const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : ADDR_COOLDOWN_MS
            failUntil.set(urlKey, Date.now() + wait)
          }
        }
      }
      const cached = getCached<T>(key, maxAge)
      if (cached) return cached
      throw lastErr || new Error('Failed to load data')
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

export type Utxo = {
  txid: string
  vout: number
  status: { confirmed: boolean, block_height?: number, block_hash?: string, block_time?: number }
  value: number // sats
  address?: string
}

export async function fetchUtxos(address: string, force: boolean = false): Promise<Utxo[]> {
  return fetchCachedWithFallback<Utxo[]>(
    `utxo:${address}`,
    [`${BASE}/address/${address}/utxo`, `${BACKUP}/address/${address}/utxo`],
    ADDR_CACHE_MS,
    force
  )
}

export async function fetchFeeRate(): Promise<number> {
  try {
    const { data } = await axios.get(`${BASE}/fee-estimates`, AXIOS_OPTS)
    const targets = [2, 3, 6, 10]
    let rate: number | undefined
    for (const t of targets) {
      if (data[t]) { rate = Math.ceil(data[t]); break }
    }
    if (!Number.isFinite(rate) || (rate as number) <= 0) throw new Error('bad fee')
    if ((rate as number) > 500) throw new Error('fee too high')
    return rate as number
  } catch {
    try {
      const { data } = await axios.get(`${MEMPOOL_BASE}/v1/fees/recommended`, AXIOS_OPTS)
      const fallback = data?.halfHourFee ?? data?.hourFee ?? data?.fastestFee
      if (Number.isFinite(fallback) && fallback > 0 && fallback < 1000) return Math.ceil(fallback)
    } catch {}
    return 5
  }
}

export async function broadcastTx(hex: string): Promise<string> {
  try {
    const { data } = await axios.post(`${BASE}/tx`, hex, { headers: { 'Content-Type': 'text/plain' } })
    return data // txid
  } catch (e: any) {
    try {
      const { data } = await axios.post(`${BACKUP}/tx`, hex, { headers: { 'Content-Type': 'text/plain' } })
      return data
    } catch (err2: any) {
      const msg2 = err2?.response?.data || err2?.message || 'Broadcast failed'
      throw new Error(typeof msg2 === 'string' ? msg2 : JSON.stringify(msg2))
    }
    const msg = e?.response?.data || e?.message || 'Broadcast failed'
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
}

export async function fetchAddressInfo(address: string, force: boolean = false): Promise<{ chain_stats: { funded_txo_sum: number, spent_txo_sum: number }, mempool_stats: { funded_txo_sum: number, spent_txo_sum: number } }> {
  return fetchCachedWithFallback(
    `addr:${address}`,
    [`${BASE}/address/${address}`, `${BACKUP}/address/${address}`],
    ADDR_CACHE_MS,
    force
  )
}

export async function fetchTipHeight(): Promise<number> {
  try {
    const { data } = await axios.get(`${BASE}/blocks/tip/height`, AXIOS_OPTS)
    return Number(data)
  } catch {
    const { data } = await axios.get(`${BACKUP}/blocks/tip/height`, AXIOS_OPTS)
    return Number(data)
  }
}

export type AddressTx = {
  txid: string
  status: { confirmed: boolean; block_time?: number }
  vin: { prevout?: { scriptpubkey_address?: string; value?: number } }[]
  vout: { scriptpubkey_address?: string; value?: number }[]
}

export async function fetchAddressTxs(address: string, force: boolean = false): Promise<AddressTx[]> {
  return fetchCachedWithFallback<AddressTx[]>(
    `txs:${address}`,
    [`${BASE}/address/${address}/txs`, `${BACKUP}/address/${address}/txs`],
    ADDR_CACHE_MS,
    force
  )
}

export async function fetchTx(txid: string): Promise<any> {
  try {
    const { data } = await axios.get(`${BASE}/tx/${txid}`, AXIOS_OPTS)
    return data
  } catch {
    const { data } = await axios.get(`${BACKUP}/tx/${txid}`, AXIOS_OPTS)
    return data
  }
}

export async function fetchBlockHashByHeight(height: number): Promise<string> {
  try {
    const { data } = await axios.get(`${BASE}/block-height/${height}`, AXIOS_OPTS)
    return data as string
  } catch {
    const { data } = await axios.get(`${BACKUP}/block-height/${height}`, AXIOS_OPTS)
    return data as string
  }
}

export async function fetchBlock(hash: string): Promise<any> {
  try {
    const { data } = await axios.get(`${BASE}/block/${hash}`, AXIOS_OPTS)
    return data
  } catch {
    const { data } = await axios.get(`${BACKUP}/block/${hash}`, AXIOS_OPTS)
    return data
  }
}

export async function fetchTxHex(txid: string): Promise<string> {
  try {
    const { data } = await axios.get(`${BASE}/tx/${txid}/hex`, AXIOS_OPTS)
    return data as string
  } catch {
    const { data } = await axios.get(`${BACKUP}/tx/${txid}/hex`, AXIOS_OPTS)
    return data as string
  }
}

const PRICE_CACHE_MS = 5 * 60 * 1000
const priceCache = new Map<string, number>()
const priceCacheAt = new Map<string, number>()
const priceFailAt = new Map<string, number>()
const pricePromise = new Map<string, Promise<number>>()
const FX_CACHE_MS = 60 * 60 * 1000
let fxRatesCache: Record<string, number> | null = null
let fxRatesAt = 0
let fxRatesFailAt = 0
let fxRatesPromise: Promise<Record<string, number> | null> | null = null

type PriceProvider = 'coingecko' | 'bitfinex' | 'bitstamp' | 'coindesk' | 'coincap' | 'mempool' | 'blockstream'
type ProviderDef = {
  id: PriceProvider
  label: string
  supports: (code: string) => boolean
  getUrl: (code: string) => string
  parse: (data: any, code: string) => number
}

const PRICE_PROVIDERS: ProviderDef[] = [
  {
    id: 'coingecko',
    label: 'CoinGecko',
    supports: () => true,
    getUrl: (code) => `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${code.toLowerCase()}`,
    parse: (data, code) => parsePrice(data?.bitcoin?.[code.toLowerCase()] ?? data)
  },
  {
    id: 'bitfinex',
    label: 'Bitfinex',
    supports: (code) => code === 'USD',
    getUrl: () => 'https://api-pub.bitfinex.com/v2/ticker/tBTCUSD',
    parse: (data) => parsePrice(Array.isArray(data) ? data[6] : data?.last_price)
  },
  {
    id: 'bitstamp',
    label: 'Bitstamp',
    supports: (code) => code === 'USD',
    getUrl: () => 'https://www.bitstamp.net/api/v2/ticker/btcusd',
    parse: (data) => parsePrice(data?.last)
  },
  {
    id: 'coindesk',
    label: 'CoinDesk',
    supports: (code) => code === 'USD',
    getUrl: () => 'https://api.coindesk.com/v1/bpi/currentprice/USD.json',
    parse: (data) => parsePrice(data?.bpi?.USD?.rate_float ?? data?.bpi?.USD?.rate)
  },
  {
    id: 'coincap',
    label: 'CoinCap',
    supports: (code) => code === 'USD',
    getUrl: () => 'https://api.coincap.io/v2/assets/bitcoin',
    parse: (data) => parsePrice(data?.data?.priceUsd)
  },
  {
    id: 'mempool',
    label: 'mempool.space',
    supports: () => true,
    getUrl: () => getMempoolPriceUrl(),
    parse: (data, code) => parsePrice(data?.[code] ?? data?.[code.toLowerCase()])
  },
  {
    id: 'blockstream',
    label: 'Blockstream',
    supports: (code) => code === 'USD',
    getUrl: () => 'https://blockstream.info/api/price',
    parse: (data, code) => parsePrice(data?.[code] ?? data?.[code.toLowerCase()])
  },
]

function parsePrice(raw: any): number {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const n = Number.parseFloat(raw)
    if (Number.isFinite(n)) return n
  }
  if (typeof raw === 'object' && raw !== null) {
    const candidate = raw.usd ?? raw.USD ?? raw.price ?? raw.rate
    if (Number.isFinite(candidate)) return Number(candidate)
  }
  return NaN
}

function getMempoolPriceUrl() {
  return BASE.includes('testnet')
    ? 'https://mempool.space/testnet/api/v1/prices'
    : 'https://mempool.space/api/v1/prices'
}

async function fetchUsdFxRates(): Promise<Record<string, number> | null> {
  if (fxRatesCache && Date.now() - fxRatesAt < FX_CACHE_MS) return fxRatesCache
  if (fxRatesPromise) return fxRatesPromise
  if (fxRatesFailAt && Date.now() - fxRatesFailAt < FX_CACHE_MS) return fxRatesCache

  fxRatesPromise = (async () => {
    try {
      const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', AXIOS_OPTS)
      const rates = data?.rates
      if (rates && typeof rates === 'object') {
        fxRatesCache = rates as Record<string, number>
        fxRatesAt = Date.now()
        fxRatesFailAt = 0
        return fxRatesCache
      }
    } catch {}
    fxRatesFailAt = Date.now()
    return fxRatesCache
  })()

  try {
    return await fxRatesPromise
  } finally {
    fxRatesPromise = null
  }
}

export async function fetchBtcFiat(currency: string): Promise<number> {
  const code = (currency || 'USD').trim().toUpperCase()
  let preferred: PriceProvider = 'coingecko'
  try {
    const v = localStorage.getItem('main.priceProvider')
    if (v === 'coingecko' || v === 'bitfinex' || v === 'bitstamp' || v === 'coindesk' || v === 'coincap' || v === 'mempool' || v === 'blockstream') {
      preferred = v
    }
  } catch {}
  const cacheKey = `${code}:${preferred}`
  const cached = priceCache.get(cacheKey)
  const cachedAt = priceCacheAt.get(cacheKey) || 0
  const lastFail = priceFailAt.get(cacheKey) || 0

  if (cached && Date.now() - cachedAt < PRICE_CACHE_MS) {
    return cached
  }

  if (pricePromise.has(cacheKey)) return pricePromise.get(cacheKey) as Promise<number>

  if (lastFail && Date.now() - lastFail < PRICE_CACHE_MS) {
    return cached ?? 0
  }
  const ordered = [
    ...PRICE_PROVIDERS.filter((p) => p.id === preferred),
    ...PRICE_PROVIDERS.filter((p) => p.id !== preferred),
  ]

  const p = (async () => {
    try {
      for (const provider of ordered) {
        if (!provider.supports(code)) continue
        try {
          const { data } = await axios.get(provider.getUrl(code), AXIOS_OPTS)
          const price = provider.parse(data, code)
          if (Number.isFinite(price) && (price as number) > 0) {
            priceCache.set(cacheKey, Number(price))
            priceCacheAt.set(cacheKey, Date.now())
            priceFailAt.delete(cacheKey)
            return Number(price)
          }
        } catch {}
      }
      if (code !== 'USD') {
        const usdPrice = await fetchBtcFiat('USD')
        const rates = await fetchUsdFxRates()
        const fx = rates?.[code]
        if (usdPrice > 0 && Number.isFinite(fx) && (fx as number) > 0) {
          const converted = Number(usdPrice) * Number(fx)
          priceCache.set(cacheKey, converted)
          priceCacheAt.set(cacheKey, Date.now())
          priceFailAt.delete(cacheKey)
          return converted
        }
      }
      priceFailAt.set(cacheKey, Date.now())
      return cached ?? 0
    } finally {
      pricePromise.delete(cacheKey)
    }
  })()

  pricePromise.set(cacheKey, p)
  return p
}

// Fetch current BTC price in USD using CSP-safe endpoints (mempool.space)
export async function fetchBtcUsd(): Promise<number> {
  return fetchBtcFiat('USD')
}

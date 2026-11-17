import axios from 'axios'

const PRIMARY = 'https://blockstream.info/testnet/api'
const BACKUP = 'https://mempool.space/testnet/api'

let BASE = PRIMARY
export function setApiBase(url: string) { BASE = url.replace(/\/$/, '') }
export function getApiBase() { return BASE }

const AXIOS_OPTS = { timeout: 8000 }

const getWithFallback = async (path: string) => {
  try {
    const { data } = await axios.get(`${BASE}${path}`, AXIOS_OPTS)
    return data
  } catch (err) {
    const { data } = await axios.get(`${BACKUP}${path}`, AXIOS_OPTS)
    return data
  }
}

export type Utxo = {
  txid: string
  vout: number
  status: { confirmed: boolean, block_height?: number, block_hash?: string, block_time?: number }
  value: number // sats
  address?: string
}

export async function fetchUtxos(address: string): Promise<Utxo[]> {
  return getWithFallback(`/address/${address}/utxo`)
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
    if ((rate as number) > 100) throw new Error('fee too high')
    return rate as number
  } catch {
    // Fallback to mempool.space recommended fees
    try {
      const { data } = await axios.get(`${PRIMARY}/v1/fees/recommended`, AXIOS_OPTS)
      const fallback = data?.halfHourFee ?? data?.hourFee ?? data?.fastestFee
      if (Number.isFinite(fallback) && fallback > 0 && fallback < 200) return Math.ceil(fallback)
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

export async function fetchAddressInfo(address: string, _force: boolean = false): Promise<{ chain_stats: { funded_txo_sum: number, spent_txo_sum: number }, mempool_stats: { funded_txo_sum: number, spent_txo_sum: number } }> {
  return getWithFallback(`/address/${address}`)
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

export async function fetchAddressTxs(address: string): Promise<AddressTx[]> {
  return getWithFallback(`/address/${address}/txs`)
}

export async function fetchTx(txid: string): Promise<any> {
  return getWithFallback(`/tx/${txid}`)
}

export async function fetchBlockHashByHeight(height: number): Promise<string> {
  return getWithFallback(`/block-height/${height}`)
}

export async function fetchBlock(hash: string): Promise<any> {
  return getWithFallback(`/block/${hash}`)
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

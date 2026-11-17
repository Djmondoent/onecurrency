import { address as bitcoinAddress, networks as bitcoinNetworks, initEccLib as initializeAddressEcc } from 'bitcoinjs-lib'
import * as bip39 from 'bip39'
import * as ecc from '@bitcoinerlab/secp256k1'
import { HDKey } from '@scure/bip32'
import { bech32, bech32m } from 'bech32'
import { sha256 } from '@noble/hashes/sha256'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { broadcastTx, fetchAddressInfo, fetchFeeRate, fetchUtxos, Utxo, fetchTx, fetchTxHex } from './api.mainnet'
import { getAddressIndex, getMnemonic as getStoredMnemonic } from './storage.mainnet'

const PLATFORM_FEE_SATS = 3337
const PLATFORM_FEE_ADDRESS = 'bc1qac34md6pn0vvhdc02araqten3tsc9972lljxvt'
const PLATFORM_DUST_SWEEP_SATS = 400

export enum Network { Mainnet = 'mainnet' }
let CURRENT_NETWORK: Network = Network.Mainnet
export function setNetwork(n: Network) { CURRENT_NETWORK = n }

function hrp() { return 'bc' }

let eccInitPromise: Promise<void> | null = null
export function ensureEccInit(): Promise<void> {
  if (!eccInitPromise) {
    eccInitPromise = import('bitcoinjs-lib').then(({ initEccLib }) => {
      initEccLib(ecc as any)
    })
  }
  return eccInitPromise
}

function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.length === 33 ? pubkey.slice(1) : pubkey
}

function legacyTaprootAddress(pubkey: Buffer): string {
  const xOnly = toXOnly(pubkey)
  const words = bech32m.toWords(xOnly)
  words.unshift(1)
  return bech32m.encode(hrp(), words)
}

export async function generateMnemonic(wordCount: 12 | 20 | 24 = 12): Promise<string> {
  if (wordCount === 20) throw new Error('20-word recovery phrases are legacy import-only')
  const strength = wordCount === 24 ? 256 : 128
  return bip39.generateMnemonic(strength)
}

export function normalizeMnemonic(m: string): string {
  const words = (m || '').toLowerCase().match(/[a-z]+/g)
  return words ? words.join(' ') : ''
}

export function validateMnemonic(m: string): boolean {
  return bip39.validateMnemonic(normalizeMnemonic(m))
}

export function isLegacyTwentyWordMnemonic(m: string): boolean {
  const normalized = normalizeMnemonic(m)
  const words = normalized ? normalized.split(' ') : []
  if (words.length !== 20) return false
  const wordlist = new Set((bip39.wordlists.english || []) as string[])
  return words.every((word) => wordlist.has(word))
}

export function isSupportedMnemonic(m: string): boolean {
  const normalized = normalizeMnemonic(m)
  const count = normalized ? normalized.split(' ').length : 0
  if (count === 20) return isLegacyTwentyWordMnemonic(normalized)
  if (count === 12 || count === 24) return validateMnemonic(normalized)
  return false
}

type AddressType = 'legacy' | 'nested-segwit' | 'native-segwit' | 'taproot'
function getSelectedAddressType(): AddressType {
  try {
    const v = localStorage.getItem('main.addrType')
    if (v === 'legacy' || v === 'nested-segwit' || v === 'native-segwit' || v === 'taproot') return v
  } catch {}
  return 'native-segwit'
}
function detectAddressType(address: string): AddressType | null {
  const a = (address || '').trim().toLowerCase()
  if (!a) return null
  if (a.startsWith('bc1p')) return 'taproot'
  if (a.startsWith('bc1')) return 'native-segwit'
  if (a.startsWith('3')) return 'nested-segwit'
  if (a.startsWith('1')) return 'legacy'
  return null
}

async function deriveNode(mnemonic: string, type?: AddressType, chain: 0 | 1 = 0) {
  const seed = await bip39.mnemonicToSeed(mnemonic)
  const root = HDKey.fromMasterSeed(new Uint8Array(seed as any))
  const t = type || getSelectedAddressType()
  const purpose = t === 'legacy' ? 44 : (t === 'nested-segwit' ? 49 : (t === 'native-segwit' ? 84 : 86))
  return root.derive(`m/${purpose}'/0'/0'/${chain}`)
}

async function deriveExternalNode(mnemonic: string, type?: AddressType) {
  return deriveNode(mnemonic, type, 0)
}

async function deriveChangeNode(mnemonic: string, type?: AddressType) {
  return deriveNode(mnemonic, type, 1)
}

function p2wpkhAddress(pubkey: Buffer): string {
  const pub = new Uint8Array(pubkey)
  const hash160 = ripemd160(sha256(pub))
  const words = bech32.toWords(Buffer.from(hash160))
  words.unshift(0)
  return bech32.encode(hrp(), words)
}

async function p2trAddress(pubkey: Buffer): Promise<string> {
  const { payments, networks } = await import('bitcoinjs-lib')
  const xOnly = toXOnly(pubkey)
  const p2tr = payments.p2tr({ internalPubkey: xOnly, network: networks.bitcoin })
  if (!p2tr.address) throw new Error('Failed to build taproot address')
  return p2tr.address
}

async function addressFromPubkey(pubkey: Buffer, type: AddressType): Promise<string> {
  if (type === 'native-segwit') return p2wpkhAddress(pubkey)
  if (type === 'taproot') return p2trAddress(pubkey)
  const { payments, networks } = await import('bitcoinjs-lib')
  const net = networks.bitcoin
  const pub = Buffer.from(pubkey)
  if (type === 'legacy') return payments.p2pkh({ pubkey: pub, network: net }).address as string
  const p2w = payments.p2wpkh({ pubkey: pub, network: net })
  return payments.p2sh({ redeem: p2w, network: net }).address as string
}

export async function getAddress(mnemonic: string, index: number): Promise<string> {
  const external = await deriveExternalNode(mnemonic, getSelectedAddressType())
  const child = external.deriveChild(index)
  if (!child.publicKey) throw new Error('No public key')
  const t = getSelectedAddressType()
  if (t === 'native-segwit') return p2wpkhAddress(Buffer.from(child.publicKey))
  if (t === 'taproot') return p2trAddress(Buffer.from(child.publicKey))
  const { payments, networks } = await import('bitcoinjs-lib')
  const net = networks.bitcoin
  const pubkey = Buffer.from(child.publicKey)
  if (t === 'legacy') return payments.p2pkh({ pubkey, network: net }).address as string
  const p2w = payments.p2wpkh({ pubkey, network: net })
  return payments.p2sh({ redeem: p2w, network: net }).address as string
}

async function listWalletAddresses(mnemonic: string, preferred?: string): Promise<string[]> {
  const maxIdx = Math.max(0, getAddressIndex())
  const addrs: string[] = []
  const t = getSelectedAddressType()
  const chains: Array<0 | 1> = [0, 1]
  if (t === 'taproot') {
    for (const chain of chains) {
      const node = await deriveNode(mnemonic, t, chain)
      for (let i = 0; i <= maxIdx; i++) {
        const child = node.deriveChild(i)
        if (!child.publicKey) continue
        const pub = Buffer.from(child.publicKey)
        addrs.push(await addressFromPubkey(pub, t))
        addrs.push(legacyTaprootAddress(pub))
      }
    }
  } else {
    for (const chain of chains) {
      const node = await deriveNode(mnemonic, t, chain)
      for (let i = 0; i <= maxIdx; i++) {
        const child = node.deriveChild(i)
        if (!child.publicKey) continue
        addrs.push(await addressFromPubkey(Buffer.from(child.publicKey), t))
      }
    }
  }
  if (preferred && !addrs.includes(preferred)) addrs.unshift(preferred)
  return Array.from(new Set(addrs))
}

async function getChangeAddress(mnemonic: string, type: AddressType): Promise<string> {
  const change = await deriveChangeNode(mnemonic, type)
  const child = change.deriveChild(Math.max(0, getAddressIndex()))
  if (!child.publicKey) throw new Error('No change public key')
  return addressFromPubkey(Buffer.from(child.publicKey), type)
}

async function deriveCandidateAddresses(pub: Buffer, type: AddressType): Promise<string[]> {
  const addrs = [await addressFromPubkey(pub, type)]
  if (type === 'taproot') addrs.push(legacyTaprootAddress(pub))
  return Array.from(new Set(addrs))
}

export async function getBalance(address: string, force: boolean = false): Promise<number> {
  const info = await fetchAddressInfo(address, force)
  const confirmed = info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum
  const unconfirmed = info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum
  return confirmed + unconfirmed
}

export async function estimateFeeRate(): Promise<number> {
  try { return await fetchFeeRate() } catch { return 5 }
}

export function isValidAddress(addr: string): boolean {
  try {
    initializeAddressEcc(ecc as any)
    const value = (addr || '').trim()
    const normalized = /^(bc1|tb1)/i.test(value) && value === value.toUpperCase() ? value.toLowerCase() : value
    bitcoinAddress.toOutputScript(normalized, bitcoinNetworks.bitcoin)
    return true
  } catch { return false }
}

function estimateVBytes(inputs: number, outputs: number): number {
  const t = getSelectedAddressType()
  const inSize =
    t === 'legacy'
      ? 148
      : (t === 'nested-segwit'
        ? 91
        : (t === 'native-segwit' ? 68 : 58))
  return Math.ceil(10 + inputs * inSize + outputs * 31)
}

function utxoScriptPubKeyFromPubkey(pubkey: Buffer): Buffer {
  const pub = new Uint8Array(pubkey)
  const hash160 = ripemd160(sha256(pub))
  const script = new Uint8Array(22)
  script[0] = 0x00
  script[1] = 0x14
  script.set(hash160, 2)
  return Buffer.from(script)
}

function getTaprootSpendInfo(address: string, pubkey: Buffer, net: any, payments: any) {
  const xOnly = toXOnly(pubkey)
  const standard = payments.p2tr({ internalPubkey: xOnly, network: net })
  const legacyAddr = legacyTaprootAddress(pubkey)
  const isLegacy = address === legacyAddr && standard.address !== address
  if (isLegacy) {
    const legacy = payments.p2tr({ pubkey: xOnly, network: net })
    if (!legacy.output) throw new Error('Failed to build taproot script')
    return { output: legacy.output, tapInternalKey: xOnly, isLegacy: true }
  }
  if (!standard.output) throw new Error('Failed to build taproot script')
  return { output: standard.output, tapInternalKey: xOnly, isLegacy: false }
}

async function verifyLegacyPrevout(txid: string, vout: number, expectedAddress: string): Promise<Buffer> {
  const { Transaction } = await import('bitcoinjs-lib')
  const hex = await fetchTxHex(txid)
  const raw = Buffer.from(hex, 'hex')
  const tx = Transaction.fromBuffer(raw)
  if (tx.getId() !== txid) throw new Error('Previous transaction hash mismatch')
  const out = tx.outs[vout]
  if (!out) throw new Error('Previous transaction output missing')
  const txInfo = await fetchTx(txid)
  const prevout = txInfo?.vout?.[vout]
  if (prevout?.scriptpubkey_address && prevout.scriptpubkey_address !== expectedAddress) {
    throw new Error('Previous output address mismatch')
  }
  if (typeof prevout?.value === 'number' && prevout.value !== out.value) {
    throw new Error('Previous output value mismatch')
  }
  return raw
}

async function verifySelectedUtxo(u: Utxo, addr: string, expectedScript?: Buffer) {
  const tx = await fetchTx(u.txid)
  const prevout = tx?.vout?.[u.vout]
  if (!prevout) throw new Error('UTXO prevout missing')
  if (prevout.scriptpubkey_address && prevout.scriptpubkey_address !== addr) throw new Error('UTXO address mismatch')
  if (Number(prevout.value) !== Number(u.value)) throw new Error('UTXO value mismatch')
  if (expectedScript && prevout.scriptpubkey && prevout.scriptpubkey !== expectedScript.toString('hex')) {
    throw new Error('UTXO script mismatch')
  }
}

function tweakTaprootPrivKey(privkey: Buffer, pubkey: Buffer, crypto: any) {
  let key = Buffer.from(privkey)
  if (pubkey.length === 33 && pubkey[0] === 0x03) {
    key = Buffer.from((ecc as any).privateNegate(key))
  }
  const xOnly = toXOnly(pubkey)
  const tweak = crypto.taggedHash('TapTweak', xOnly)
  const tweakedPriv = (ecc as any).privateAdd(key, tweak)
  if (!tweakedPriv) throw new Error('Invalid taproot tweak')
  const tweakedPub = (ecc as any).xOnlyPointAddTweak(xOnly, tweak)
  if (!tweakedPub || !tweakedPub.xOnlyPubkey) throw new Error('Invalid taproot tweak')
  return { privateKey: Buffer.from(tweakedPriv), publicKey: Buffer.from(tweakedPub.xOnlyPubkey) }
}

async function findChildForAddress(mnemonic: string, address: string, scan: number = 20): Promise<{ pub: Buffer, priv: Buffer | null }> {
  const detected = detectAddressType(address) || getSelectedAddressType()
  try {
    const idxStr = localStorage.getItem('main.addrIndex')
    const idx = idxStr ? Math.max(0, Math.floor(parseInt(idxStr, 10))) : 0
    scan = Math.max(scan, idx + 5)
  } catch {}
  if (detected === 'taproot') {
    scan = Math.max(scan, 100)
  }
  for (const chain of [0, 1] as Array<0 | 1>) {
    const node = await deriveNode(mnemonic, detected, chain)
    for (let i = 0; i < scan; i++) {
      const child = node.deriveChild(i)
      if (!child.publicKey) continue
      const pub = Buffer.from(child.publicKey)
      const addrs = await deriveCandidateAddresses(pub, detected)
      if (addrs.includes(address)) {
        return { pub: Buffer.from(child.publicKey), priv: child.privateKey ? Buffer.from(child.privateKey as any) : null }
      }
    }
  }
  throw new Error('No wallet key found for input address; check the wallet and address index')
}

export async function buildAndBroadcast(fromAddress: string, toAddress: string, amountSats: number, feeRate: number): Promise<{ txid: string, hex: string }> {
  return buildAndBroadcastMulti(fromAddress, [{ address: toAddress, value: amountSats }], feeRate)
}

export async function buildAndBroadcastMulti(fromAddress: string, targets: SendTarget[], feeRate: number, utxosOverride?: Array<Utxo & { address: string }>): Promise<{ txid: string, hex: string }> {
  if (!targets.length) throw new Error('Add at least one recipient')
  if (!Number.isFinite(feeRate) || feeRate <= 0) throw new Error('Fee rate must be a positive finite number')
  let total = 0
  for (const target of targets) {
    if (!isValidAddress(target.address)) throw new Error('Invalid destination address for this network')
    if (!Number.isSafeInteger(target.value) || target.value <= 0) throw new Error('Amounts must be positive whole satoshis')
    total += target.value
  }
  if (!Number.isSafeInteger(total) || total > 2100000000000000) throw new Error('Total amount exceeds the Bitcoin supply')

  const utxos = utxosOverride && utxosOverride.length ? utxosOverride : await getUtxos(fromAddress)
  if (utxos.length === 0) throw new Error('No funds available')

  const { selected, fee, change, hasChange, platformSweep } = selectForTargets(utxos, targets, feeRate, PLATFORM_FEE_SATS)
  if (!selected.length) {
    const max = maxSpendable(utxos, feeRate)
    throw new Error(`Insufficient balance for amount + platform fee + miner fee. Max spendable: ${max} sats`)
  }

  const mnemonic = getStoredMnemonic()
  if (!mnemonic) throw new Error('Missing wallet seed')
  const keyCache = new Map<string, { pub: Buffer, priv: Buffer | null }>()
  const getKeyFor = async (addr: string) => {
    const cached = keyCache.get(addr)
    if (cached) return cached
    const child = await findChildForAddress(mnemonic, addr)
    keyCache.set(addr, child)
    return child
  }
  const { Psbt, initEccLib, networks, payments, crypto } = await import('bitcoinjs-lib')
  initEccLib(ecc as any)
  const psbt = new Psbt({ network: networks.bitcoin })
  const addrType = detectAddressType(fromAddress) || getSelectedAddressType()
  const changeAddress = hasChange ? await getChangeAddress(mnemonic, addrType) : fromAddress
  if (addrType === 'native-segwit') {
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const child = await getKeyFor(addr)
      if (!child.pub || !child.priv) throw new Error('Missing key material')
      const fromScript = utxoScriptPubKeyFromPubkey(child.pub)
      await verifySelectedUtxo(u, addr, fromScript)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script: fromScript, value: u.value },
        sequence: 0xfffffffd,
      })
    }
  } else if (addrType === 'taproot') {
    const net = networks.bitcoin
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const child = await getKeyFor(addr)
      if (!child.pub || !child.priv) throw new Error('Missing key material')
      const tapInfo = getTaprootSpendInfo(addr, child.pub, net, payments)
      await verifySelectedUtxo(u, addr, tapInfo.output)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script: tapInfo.output, value: u.value },
        tapInternalKey: tapInfo.tapInternalKey,
        sequence: 0xfffffffd,
      })
    }
  } else if (addrType === 'nested-segwit') {
    const net = networks.bitcoin
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const child = await getKeyFor(addr)
      if (!child.pub || !child.priv) throw new Error('Missing key material')
      const p2w = payments.p2wpkh({ pubkey: child.pub, network: net })
      const p2sh = payments.p2sh({ redeem: p2w, network: net })
      if (!p2w.output || !p2sh.output) throw new Error('Failed to build redeem scripts')
      await verifySelectedUtxo(u, addr, p2sh.output)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script: p2sh.output, value: u.value },
        redeemScript: p2w.output,
        sequence: 0xfffffffd,
      })
    }
  } else {
    // legacy P2PKH requires nonWitnessUtxo
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const rawTx = await verifyLegacyPrevout(u.txid, u.vout, addr)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        nonWitnessUtxo: rawTx,
        sequence: 0xfffffffd,
      })
    }
  }
  for (const t of targets) {
    psbt.addOutput({ address: t.address, value: t.value })
  }
  psbt.addOutput({ address: PLATFORM_FEE_ADDRESS, value: PLATFORM_FEE_SATS + platformSweep })
  if (hasChange) psbt.addOutput({ address: changeAddress, value: change })
  for (let i = 0; i < selected.length; i++) {
    const u = selected[i]
    const addr = (u as any).address || fromAddress
    const child = await getKeyFor(addr)
    if (!child.pub || !child.priv) throw new Error('Missing key material')
    let signer: any
    if (addrType === 'taproot') {
      const tapInfo = getTaprootSpendInfo(addr, child.pub, networks.bitcoin, payments)
      if (tapInfo.isLegacy) {
        signer = {
          publicKey: tapInfo.tapInternalKey,
          signSchnorr: (hash: Buffer) => Buffer.from((ecc as any).signSchnorr(hash, child.priv!)),
        }
      } else {
        const tweaked = tweakTaprootPrivKey(child.priv!, child.pub, crypto)
        signer = {
          publicKey: tweaked.publicKey,
          signSchnorr: (hash: Buffer) => Buffer.from((ecc as any).signSchnorr(hash, tweaked.privateKey)),
        }
      }
    } else {
      signer = {
        publicKey: child.pub,
        sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, child.priv!)),
      }
    }
    psbt.signInput(i, signer as any)
  }
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction()
  const hex = tx.toHex()
  const txid = await broadcastTx(hex)
  return { txid, hex }
}

export async function buildUnsignedPsbt(fromAddress: string, toAddress: string, amountSats: number, feeRate: number): Promise<{ psbt: string, fee: number, change: number, hasChange: boolean }> {
  return buildUnsignedPsbtMulti(fromAddress, [{ address: toAddress, value: amountSats }], feeRate)
}

export async function buildUnsignedPsbtMulti(fromAddress: string, targets: SendTarget[], feeRate: number, utxosOverride?: Array<Utxo & { address: string }>): Promise<{ psbt: string, fee: number, change: number, hasChange: boolean }> {
  if (!targets.length) throw new Error('Add at least one recipient')
  if (!Number.isFinite(feeRate) || feeRate <= 0) throw new Error('Fee rate must be a positive finite number')
  let total = 0
  for (const target of targets) {
    if (!isValidAddress(target.address)) throw new Error('Invalid destination address for this network')
    if (!Number.isSafeInteger(target.value) || target.value <= 0) throw new Error('Amounts must be positive whole satoshis')
    total += target.value
  }
  if (!Number.isSafeInteger(total) || total > 2100000000000000) throw new Error('Total amount exceeds the Bitcoin supply')

  const utxos = utxosOverride && utxosOverride.length ? utxosOverride : await getUtxos(fromAddress)
  if (utxos.length === 0) throw new Error('No funds available')
  const { selected, fee, change, hasChange, platformSweep } = selectForTargets(utxos, targets, feeRate, PLATFORM_FEE_SATS)
  if (!selected.length) {
    const max = maxSpendable(utxos, feeRate)
    throw new Error(`Insufficient balance for amount + platform fee + miner fee. Max spendable: ${max} sats`)
  }
  const mnemonic = getStoredMnemonic()
  if (!mnemonic) throw new Error('Missing wallet seed')
  const keyCache = new Map<string, { pub: Buffer, priv: Buffer | null }>()
  const getKeyFor = async (addr: string) => {
    const cached = keyCache.get(addr)
    if (cached) return cached
    const child = await findChildForAddress(mnemonic, addr)
    keyCache.set(addr, child)
    return child
  }
  const { Psbt, initEccLib, networks, payments } = await import('bitcoinjs-lib')
  initEccLib(ecc as any)
  const psbt = new Psbt({ network: networks.bitcoin })
  const addrType = detectAddressType(fromAddress) || getSelectedAddressType()
  const changeAddress = hasChange ? await getChangeAddress(mnemonic, addrType) : fromAddress
  if (addrType === 'native-segwit') {
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const child = await getKeyFor(addr)
      if (!child.pub) throw new Error('Missing key material')
      const fromScript = utxoScriptPubKeyFromPubkey(child.pub)
      await verifySelectedUtxo(u, addr, fromScript)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script: fromScript, value: u.value },
        sequence: 0xfffffffd,
      })
    }
  } else if (addrType === 'taproot') {
    const net = networks.bitcoin
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const child = await getKeyFor(addr)
      if (!child.pub) throw new Error('Missing key material')
      const tapInfo = getTaprootSpendInfo(addr, child.pub, net, payments)
      await verifySelectedUtxo(u, addr, tapInfo.output)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script: tapInfo.output, value: u.value },
        tapInternalKey: tapInfo.tapInternalKey,
        sequence: 0xfffffffd,
      })
    }
  } else if (addrType === 'nested-segwit') {
    const net = networks.bitcoin
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const child = await getKeyFor(addr)
      if (!child.pub) throw new Error('Missing key material')
      const p2w = payments.p2wpkh({ pubkey: child.pub, network: net })
      const p2sh = payments.p2sh({ redeem: p2w, network: net })
      if (!p2w.output || !p2sh.output) throw new Error('Failed to build redeem scripts')
      await verifySelectedUtxo(u, addr, p2sh.output)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: { script: p2sh.output, value: u.value },
        redeemScript: p2w.output,
        sequence: 0xfffffffd,
      })
    }
  } else {
    for (const u of selected) {
      const addr = (u as any).address || fromAddress
      const rawTx = await verifyLegacyPrevout(u.txid, u.vout, addr)
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        nonWitnessUtxo: rawTx,
        sequence: 0xfffffffd,
      })
    }
  }
  for (const t of targets) {
    psbt.addOutput({ address: t.address, value: t.value })
  }
  psbt.addOutput({ address: PLATFORM_FEE_ADDRESS, value: PLATFORM_FEE_SATS + platformSweep })
  if (hasChange) psbt.addOutput({ address: changeAddress, value: change })
  return { psbt: psbt.toBase64(), fee, change, hasChange }
}

export async function broadcastSignedPsbt(psbtB64: string): Promise<{ txid: string, hex: string }> {
  const { Psbt, initEccLib, networks } = await import('bitcoinjs-lib')
  initEccLib(ecc as any)
  const psbt = Psbt.fromBase64(psbtB64, { network: networks.bitcoin })
  try { psbt.finalizeAllInputs() } catch {}
  const tx = psbt.extractTransaction()
  const hex = tx.toHex()
  const txid = await broadcastTx(hex)
  return { txid, hex }
}

export async function getUtxos(preferredAddress: string): Promise<Array<Utxo & { address: string }>> {
  const mnemonic = getStoredMnemonic()
  if (!mnemonic) {
    const list = await fetchUtxos(preferredAddress)
    return list.map(u => ({ ...u, address: preferredAddress }))
  }
  const addresses = await listWalletAddresses(mnemonic, preferredAddress)
  const out: Array<Utxo & { address: string }> = []
  for (const addr of addresses) {
    try {
      const items = await fetchUtxos(addr)
      out.push(...items.map(u => ({ ...u, address: addr })))
    } catch {
      // Skip failed address fetches
    }
  }
  return out
}

export async function getUtxosForAddress(address: string): Promise<Array<Utxo & { address: string }>> {
  const list = await fetchUtxos(address)
  return list.map(u => ({ ...u, address }))
}

export function maxSpendable(utxos: Utxo[], feeRate: number, outputsBase: number = 2, platformFee: number = PLATFORM_FEE_SATS): number {
  if (!utxos.length) return 0
  const inputs = utxos.length
  const fee = Math.max(1, Math.ceil(estimateVBytes(inputs, outputsBase) * feeRate))
  const sum = utxos.reduce((a, u) => a + u.value, 0)
  const max = sum - platformFee - fee
  return Math.max(0, max)
}

export type SendTarget = { address: string, value: number }

function selectForTargets(utxos: Utxo[], targets: SendTarget[], feeRate: number, platformFee: number): { selected: Utxo[], inValue: number, inputs: number, fee: number, change: number, hasChange: boolean, platformSweep: number } {
  if (!targets.length) return { selected: [], inValue: 0, inputs: 0, fee: 0, change: 0, hasChange: false, platformSweep: 0 }
  const sorted = [...utxos].sort((a, b) => a.value - b.value)
  const spendValue = targets.reduce((a, t) => a + t.value, 0) + platformFee
  const outputsBase = targets.length + 1 // targets + platform
  const DUST = PLATFORM_DUST_SWEEP_SATS
  let selected: Utxo[] = []
  let inValue = 0
  let inputs = 0
  let fee = 0
  let change = 0
  for (const u of sorted) {
    selected.push(u)
    inValue += u.value
    inputs = selected.length
    fee = Math.max(1, Math.ceil(estimateVBytes(inputs, outputsBase + 1) * feeRate))
    change = inValue - spendValue - fee
    if (change >= DUST) break
    fee = Math.max(1, Math.ceil(estimateVBytes(inputs, outputsBase) * feeRate))
    change = inValue - spendValue - fee
    if (change >= 0 && change < DUST) {
      break
    }
  }
  if (inValue < spendValue + fee) {
    return { selected: [], inValue, inputs, fee, change: 0, hasChange: false, platformSweep: 0 }
  }
  const platformSweep = change > 0 && change < PLATFORM_DUST_SWEEP_SATS ? change : 0
  const hasChange = change >= PLATFORM_DUST_SWEEP_SATS
  return { selected, inValue, inputs, fee, change: hasChange ? change : 0, hasChange, platformSweep }
}

export function selectForAmount(utxos: Utxo[], amountSats: number, feeRate: number): { selected: Utxo[], inValue: number, inputs: number, fee: number, change: number, hasChange: boolean } {
  return selectForTargets(utxos, [{ address: '', value: amountSats }], feeRate, PLATFORM_FEE_SATS)
}

export function selectForTargetsWithFee(utxos: Utxo[], targets: SendTarget[], feeRate: number, platformFee: number = PLATFORM_FEE_SATS) {
  return selectForTargets(utxos, targets, feeRate, platformFee)
}

export async function signMessage(index: number, message: string): Promise<{ address: string, signature: string, pubkey: string }> {
  const mnemonic = getStoredMnemonic()
  if (!mnemonic) throw new Error('Missing wallet seed')
  const seed = await (await import('bip39')).mnemonicToSeed(mnemonic)
  const { HDKey } = await import('@scure/bip32')
  const root = HDKey.fromMasterSeed(new Uint8Array(seed as any))
  const external = root.derive(`m/84'/0'/0'/0`)
  const child = external.deriveChild(index)
  if (!child.publicKey || !child.privateKey) throw new Error('Missing key material')
  const pub = Buffer.from(child.publicKey)
  const addr = p2wpkhAddress(pub)
  // Bitcoin Signed Message hashing: "\x18Bitcoin Signed Message:\n" + varint(len) + msg; double-SHA256
  function varInt(n: number): Buffer {
    if (n < 0xfd) return Buffer.from([n])
    if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, (n >>> 8) & 0xff])
    if (n <= 0xffffffff) return Buffer.from([0xfe, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
    const bn = BigInt(n)
    const out = Buffer.alloc(9)
    out[0] = 0xff
    let x = bn
    for (let i = 1; i <= 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n }
    return out
  }
  const prefix = Buffer.from('Bitcoin Signed Message:\n', 'utf8')
  const msgBytes = Buffer.from(new TextEncoder().encode(message))
  const payload = Buffer.concat([varInt(prefix.length), prefix, varInt(msgBytes.length), msgBytes])
  const h1 = sha256(payload)
  const h2 = sha256(h1)
  // Compact recoverable signature with header byte (base64), compatible with Core verifymessage
  const rec = (ecc as any).signRecoverable(Buffer.from(h2), Buffer.from(child.privateKey as any))
  const header = 27 + 4 + (rec.recoveryId || 0)
  const sig65 = Buffer.concat([Buffer.from([header]), Buffer.from(rec.signature)])
  const signatureB64 = sig65.toString('base64')
  return { address: addr, signature: signatureB64, pubkey: pub.toString('hex') }
}

export async function signMessageBytes(index: number, bytes: Uint8Array): Promise<{ address: string, signature: string, pubkey: string }> {
  const mnemonic = getStoredMnemonic()
  if (!mnemonic) throw new Error('Missing wallet seed')
  const seed = await (await import('bip39')).mnemonicToSeed(mnemonic)
  const { HDKey } = await import('@scure/bip32')
  const root = HDKey.fromMasterSeed(new Uint8Array(seed as any))
  const external = root.derive(`m/84'/0'/0'/0`)
  const child = external.deriveChild(index)
  if (!child.publicKey || !child.privateKey) throw new Error('Missing key material')
  const pub = Buffer.from(child.publicKey)
  const addr = p2wpkhAddress(pub)
  function varInt(n: number): Buffer {
    if (n < 0xfd) return Buffer.from([n])
    if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, (n >>> 8) & 0xff])
    if (n <= 0xffffffff) return Buffer.from([0xfe, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
    const bn = BigInt(n)
    const out = Buffer.alloc(9)
    out[0] = 0xff
    let x = bn
    for (let i = 1; i <= 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n }
    return out
  }
  const prefix = Buffer.from('Bitcoin Signed Message:\n', 'utf8')
  const msgBytes = Buffer.from(bytes)
  const payload = Buffer.concat([varInt(prefix.length), prefix, varInt(msgBytes.length), msgBytes])
  const h1 = sha256(payload)
  const h2 = sha256(h1)
  const rec = (ecc as any).signRecoverable(Buffer.from(h2), Buffer.from(child.privateKey as any))
  const header = 27 + 4 + (rec.recoveryId || 0)
  const sig65 = Buffer.concat([Buffer.from([header]), Buffer.from(rec.signature)])
  const signatureB64 = sig65.toString('base64')
  return { address: addr, signature: signatureB64, pubkey: pub.toString('hex') }
}

export async function bumpFeeRbf(fromAddress: string, txid: string, newFeeRate: number): Promise<{ txid: string, hex: string }> {
  const info = await fetchTx(txid)
  if (info?.status?.confirmed) throw new Error('Transaction already confirmed')
  const vins = info.vin || []
  const vouts = info.vout || []
  // Verify inputs belong to our fromAddress
  for (const vin of vins) {
    const prev = vin.prevout
    if (!prev || prev.scriptpubkey_address !== fromAddress) {
      throw new Error('Cannot bump: input not from this address')
    }
  }
  const inputs = vins.map((vin: any) => ({ txid: vin.txid, vout: vin.vout, value: vin.prevout.value }))
  const totalIn = inputs.reduce((a: number, i: any) => a + (i.value || 0), 0)
  const outputs = vouts.map((o: any) => ({ address: o.scriptpubkey_address, value: o.value }))
  const idxChange = outputs.findIndex((o: any) => o.address === fromAddress)
  if (idxChange === -1) throw new Error('Cannot bump: no change output to adjust')
  const currentFee = totalIn - outputs.reduce((a: number, o: any) => a + (o.value || 0), 0)
  let outCount = outputs.length
  const vbytes = estimateVBytes(inputs.length, outCount)
  let targetFee = Math.max(currentFee + 1, Math.ceil(vbytes * newFeeRate))
  let delta = targetFee - currentFee
  let newChange = outputs[idxChange].value - delta
  const DUST = 546
  if (newChange < DUST) {
    // Drop change output, recompute fee with one fewer output
    outCount = outputs.length - 1
    const vbytes2 = estimateVBytes(inputs.length, outCount)
    targetFee = Math.max(currentFee + 1, Math.ceil(vbytes2 * newFeeRate))
    delta = targetFee - currentFee
    newChange = 0
    outputs.splice(idxChange, 1)
  } else {
    outputs[idxChange].value = newChange
  }
  if (targetFee <= currentFee) throw new Error('Replacement fee not higher than original')

  const mnemonic = getStoredMnemonic()
  if (!mnemonic) throw new Error('Missing wallet seed')
  const child = await findChildForAddress(mnemonic, fromAddress)
  if (!child.pub || !child.priv) throw new Error('Missing key material')
  const fromScript = utxoScriptPubKeyFromPubkey(child.pub)

  const { Psbt, initEccLib, networks } = await import('bitcoinjs-lib')
  initEccLib(ecc as any)
  const psbt = new Psbt({ network: networks.bitcoin })
  for (const i of inputs) {
    psbt.addInput({
      hash: i.txid,
      index: i.vout,
      witnessUtxo: { script: fromScript, value: i.value },
      sequence: 0xfffffffd,
    })
  }
  for (const o of outputs) {
    psbt.addOutput({ address: o.address, value: o.value })
  }
  const signer = {
    publicKey: child.pub,
    sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, child.priv!)),
  }
  psbt.signAllInputs(signer as any)
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction()
  const hex = tx.toHex()
  const newTxid = await broadcastTx(hex)
  return { txid: newTxid, hex }
}

export async function cpfpBoost(fromAddress: string, parentTxid: string, childFeeRate: number): Promise<{ txid: string, hex: string }> {
  const info = await fetchTx(parentTxid)
  if (info?.status?.confirmed) throw new Error('Parent already confirmed')
  const vouts = info.vout || []
  const change = vouts.find((o: any) => o.scriptpubkey_address === fromAddress)
  if (!change) throw new Error('No change output to spend for CPFP')
  const value = change.value
  const vbytes = estimateVBytes(1, 1)
  const fee = Math.max(1, Math.ceil(vbytes * childFeeRate))
  const DUST = 546
  const outValue = value - fee
  if (outValue < DUST) throw new Error('Change too small for CPFP')

  const mnemonic = getStoredMnemonic()
  if (!mnemonic) throw new Error('Missing wallet seed')
  const child = await findChildForAddress(mnemonic, fromAddress)
  if (!child.pub || !child.priv) throw new Error('Missing key material')
  const fromScript = utxoScriptPubKeyFromPubkey(child.pub)

  const { Psbt, initEccLib, networks } = await import('bitcoinjs-lib')
  initEccLib(ecc as any)
  const psbt = new Psbt({ network: networks.bitcoin })
  psbt.addInput({
    hash: info.txid,
    index: change.n,
    witnessUtxo: { script: fromScript, value },
    sequence: 0xfffffffd,
  })
  psbt.addOutput({ address: fromAddress, value: outValue })
  const signer = {
    publicKey: child.pub,
    sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, child.priv!)),
  }
  psbt.signAllInputs(signer as any)
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction()
  const hex = tx.toHex()
  const newTxid = await broadcastTx(hex)
  return { txid: newTxid, hex }
}

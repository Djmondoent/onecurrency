import React, { useEffect, useMemo, useState } from 'react'
import {
  buildAndBroadcastMulti,
  buildUnsignedPsbtMulti,
  broadcastSignedPsbt,
  estimateFeeRate,
  isValidAddress,
  getUtxosForAddress,
  maxSpendable,
  selectForTargetsWithFee,
  SendTarget,
} from '../../lib/wallet.mainnet'
import { fetchBtcUsd } from '../../lib/api.mainnet'
import QrScanner from '../QrScanner'
import { playSendSound } from '../../receiveSound'
import { getMnemonic } from '../../lib/storage.mainnet'
import WindowShell from '../WindowShell'

type Props = {
  fromAddress: string
  onBroadcasted: () => Promise<void>
  requestPassphrase?: () => Promise<boolean>
}

export default function SendMain({ fromAddress, onBroadcasted, requestPassphrase }: Props) {
  const [addrListRaw, setAddrListRaw] = useState<string>('')
  const [totalSats, setTotalSats] = useState<string>('')
  const [feeRate, setFeeRate] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txid, setTxid] = useState<string | null>(null)
  const [utxos, setUtxos] = useState<Array<{ value: number }>>([])
  const [utxoErr, setUtxoErr] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unsignedPsbt, setUnsignedPsbt] = useState<string>('')
  const [signedPsbt, setSignedPsbt] = useState<string>('')
  const [psbtStatus, setPsbtStatus] = useState<string | null>(null)
  const [scanOpen, setScanOpen] = useState(false)

  const parsePayment = (raw: string) => {
    const v = raw.trim()
    if (v.toLowerCase().startsWith('bitcoin:')) {
      try {
        const url = new URL(v)
        const addr = url.pathname.replace(/^\/+/, '')
        const amtParam = url.searchParams.get('amount')
        const sats = amtParam ? Math.round(parseFloat(amtParam) * 1e8) : null
        return { addr, sats }
      } catch {
        return { addr: v.replace(/^bitcoin:/i, ''), sats: null }
      }
    }
    return { addr: v, sats: null }
  }

  // Constants
  const PLATFORM_FEE_SATS = 3337
  // "100 billion a bitcoin" math => $1000 per sat
  const FUTURE_USD_PER_SAT = 1000

  // Live price
  const [btcUsd, setBtcUsd] = useState<number | null>(null)
  const usdPerSat = useMemo(() => (btcUsd ? btcUsd / 1e8 : 0), [btcUsd])

  // Formatters
  const fmtUSD = (n: number) =>
    n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  const fmtBTC = (sats: number) =>
    (sats / 1e8).toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 }) + ' BTC'

  // Loaders
  useEffect(() => {
    (async () => {
      try { setFeeRate(await estimateFeeRate()) } catch { setFeeRate(5) }
    })()
  }, [])

  useEffect(() => {
    (async () => {
      try { setBtcUsd(await fetchBtcUsd()) } catch { setBtcUsd(null) }
    })()
  }, [])

  const loadUtxos = async () => {
    if (!fromAddress) return
    setUtxoErr(null)
    try {
      const u = await getUtxosForAddress(fromAddress)
      setUtxos(u as any)
    } catch (e: any) {
      const msg = e?.message || 'Failed to load UTXOs'
      setUtxoErr(msg)
      setError(msg)
      setUtxos([])
    }
  }
  useEffect(() => { loadUtxos() }, [fromAddress])
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { id?: string } | undefined
      if (detail?.id === 'sendConfirmMainnet') setConfirmOpen(false)
    }
    document.addEventListener('window:close', handler)
    return () => document.removeEventListener('window:close', handler)
  }, [])

  // Derived
  const addresses = useMemo(() => {
    const parts = addrListRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
    return Array.from(new Set(parts))
  }, [addrListRaw])

  const totalAmountNum = useMemo(() => parseInt(totalSats || '0', 10) || 0, [totalSats])

  const targets: SendTarget[] = useMemo(() => {
    if (!addresses.length || totalAmountNum <= 0) return []
    const per = Math.floor(totalAmountNum / addresses.length)
    let remainder = totalAmountNum - per * addresses.length
    const out = addresses.map(addr => {
      const extra = remainder > 0 ? 1 : 0
      if (remainder > 0) remainder -= 1
      return { address: addr, value: per + extra }
    }).filter(t => t.value > 0)
    return out
  }, [addresses, totalAmountNum])

  const totalAmount = targets.reduce((a, t) => a + t.value, 0)
  const utxoTotal = useMemo(
    () => utxos.reduce((a, u: any) => a + (u.value || 0), 0),
    [utxos]
  )

  const est = useMemo(() => {
    if (!utxos.length || !feeRate) return null as null | { fee: number; change: number; inputs: number; hasChange: boolean }
    if (!targets.length) return null
    const s = selectForTargetsWithFee(utxos as any, targets, feeRate)
    if (!s.selected.length) return null
    return { fee: s.fee, change: s.change, inputs: s.inputs, hasChange: s.hasChange }
  }, [utxos, targets, feeRate])

  // Actions
  const onUseMax = () => {
    if (!utxos.length || !feeRate) return
    if (!addresses.length) { setError('Add at least one address before using max'); return }
    try {
      const outputsBase = Math.max(2, addresses.length + 1) // recipients + platform fee
      const max = maxSpendable(utxos as any, feeRate, outputsBase)
      setTotalSats(String(Math.max(0, max)))
    } catch (e: any) {
      setError(e?.message || 'Failed to compute max')
    }
  }

  const ensureSendAuth = async (): Promise<boolean> => {
    if (!requestPassphrase) return true
    try {
      return await requestPassphrase()
    } catch {
      return false
    }
  }

  const openConfirm = async () => {
    setError(null)
    setTxid(null)
    if (!fromAddress) { setError('Wallet not ready'); return }
    if (!feeRate) { setError('Fee rate unavailable'); return }
    if (!targets.length) { setError('Add at least one recipient with amount'); return }
    if (!getMnemonic()) { setError('Unlock wallet to send'); return }
    if (!utxos.length) { setError('Waiting for wallet UTXOs. Try again in a moment.'); await loadUtxos(); return }
    for (const t of targets) {
      if (!isValidAddress(t.address)) { setError(`Invalid destination: ${t.address}`); return }
      if (t.value <= 0) { setError('Amounts must be positive'); return }
    }
    setConfirmOpen(true)
  }

  const onConfirmSend = async () => {
    if (!feeRate) return
    setBusy(true)
    try {
      const ok = await ensureSendAuth()
      if (!ok) { setError('Passphrase required to send'); return }
      if (!utxos.length) { setError('Waiting for wallet UTXOs. Try again in a moment.'); await loadUtxos(); return }
      const result = await buildAndBroadcastMulti(fromAddress, targets, feeRate, utxos as any)
      setTxid(result.txid)
      setConfirmOpen(false)
      playSendSound()
      await onBroadcasted()
    } catch (e: any) {
      setError(e?.message || 'Failed to send')
    } finally {
      setBusy(false)
    }
  }

  const onCreatePsbt = async () => {
    setPsbtStatus(null)
    if (!fromAddress) { setPsbtStatus('Wallet not ready'); return }
    if (!targets.length) { setPsbtStatus('Add at least one recipient'); return }
    if (!getMnemonic()) { setPsbtStatus('Unlock wallet to build PSBT'); return }
    if (!utxos.length) { setPsbtStatus('Waiting for wallet UTXOs. Try again in a moment.'); await loadUtxos(); return }
    for (const t of targets) {
      if (!isValidAddress(t.address)) { setPsbtStatus(`Invalid destination: ${t.address}`); return }
      if (!Number.isFinite(t.value) || t.value <= 0) { setPsbtStatus('Enter amount in sats'); return }
    }
    if (!feeRate) { setPsbtStatus('Fee rate unavailable'); return }
    setBusy(true)
    try {
      const { psbt, fee, change, hasChange } = await buildUnsignedPsbtMulti(fromAddress, targets, feeRate, utxos as any)
      setUnsignedPsbt(psbt)
      setPsbtStatus(`Unsigned PSBT ready. Fee: ${fee} sats${hasChange ? ` | Change: ${change} sats` : ' | No change output'}`)
    } catch (e: any) {
      setPsbtStatus(e?.message || 'Failed to build PSBT')
    } finally {
      setBusy(false)
    }
  }

  const onBroadcastSigned = async () => {
    setPsbtStatus(null)
    if (!signedPsbt.trim()) { setPsbtStatus('Paste a signed PSBT (base64)'); return }
    setBusy(true)
    try {
      const ok = await ensureSendAuth()
      if (!ok) { setPsbtStatus('Passphrase required to broadcast'); return }
      const res = await broadcastSignedPsbt(signedPsbt.trim())
      setTxid(res.txid)
      setPsbtStatus('Broadcasted signed PSBT')
      playSendSound()
      await onBroadcasted()
    } catch (e: any) {
      setPsbtStatus(e?.message || 'Failed to broadcast signed PSBT')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <WindowShell id="send" title="Send">
        <div className="note" style={{ marginTop: 6 }}>
          This wallet shows two USD views: a live BTC/USD market price and our long-term
          projection of 100B USD per BTC. Both are shown for comparison while sending real BTC.
        </div>

        <label style={{ display: 'block', marginTop: 8 }}>
          Paste addresses (one per line or separated by commas/spaces)
          <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
            <textarea className="textarea" rows={4} placeholder="bc1...\nbc1...\n..." value={addrListRaw} onChange={(e) => setAddrListRaw(e.target.value)} />
            <button className="btn" type="button" onClick={() => setScanOpen(true)}>Scan QR</button>
          </div>
        </label>

        <label style={{ display: 'block', marginTop: 8 }}>
          Total amount (sats) - evenly split across all addresses
          <input
            className="input"
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 5000"
            value={totalSats}
            onChange={(e) => setTotalSats(e.target.value)}
          />
        </label>

        {totalAmount > 0 && addresses.length > 0 && (
          <>
            <div className="subtle" style={{ marginTop: 4 }}>
              {btcUsd ? <>{'\u2248 '}{fmtUSD(totalAmount * usdPerSat)}</> : 'Live USD price unavailable'}
            </div>
            <div className="subtle" style={{ marginTop: 2 }}>
              {'\u2248 '}Future USD: {fmtUSD(totalAmount * FUTURE_USD_PER_SAT)}
            </div>
            <div className="subtle" style={{ marginTop: 2 }}>
              {'\u2248 '}{fmtBTC(totalAmount)}
            </div>
            <div className="note" style={{ marginTop: 6 }}>
              <div className="kv">Per-recipient amount</div>
              <div className="mono" style={{ marginTop: 4 }}>{Math.floor(totalAmount / addresses.length)} sats (remainder spread)</div>
            </div>
          </>
        )}

        <label style={{ display: 'block', marginTop: 8 }}>
          Fee rate (sat/vB)
          <div className="row" style={{ marginTop: 4 }}>
            <input
              className="input"
              style={{ width: 140 }}
              type="number"
              min={1}
              step={1}
              value={feeRate ?? ''}
              onChange={(e) => setFeeRate(e.target.value ? Number(e.target.value) : null)}
            />
            <button className="btn" type="button" onClick={async () => { const fr = await estimateFeeRate(); setFeeRate(fr) }}>Estimate</button>
            <button className="btn" type="button" onClick={() => setFeeRate(5)}>Default 5</button>
          </div>
        </label>

        {utxoErr && <div className="alert" style={{ marginTop: 8 }}>{utxoErr}</div>}

        {est && (
          <>
            <div className="subtle" style={{ marginTop: 8 }}>
              <span title="One Currency platform fee: 3,337 sats per mainnet transaction. Separate from the Bitcoin network (miner) fee.">
                Platform fee
              </span>: {PLATFORM_FEE_SATS} sats ({btcUsd ? <>{'\u2248 '}{fmtUSD(PLATFORM_FEE_SATS * usdPerSat)}</> : 'USD n/a'})
            </div>
            <div className="subtle" style={{ marginTop: 2 }}>
              {'\u2248 '}Future USD: {fmtUSD(PLATFORM_FEE_SATS * FUTURE_USD_PER_SAT)}
            </div>
            <div className="subtle" style={{ marginTop: 4 }}>
              Miner fee: {est.fee} sats ({btcUsd ? <>{'\u2248 '}{fmtUSD(est.fee * usdPerSat)}</> : 'USD n/a'}, {fmtBTC(est.fee)}) {'\u00B7'} Inputs: {est.inputs} {'\u00B7'} {est.hasChange ? `Change: ${est.change} sats` : 'No change'}
            </div>
            <div className="subtle" style={{ marginTop: 2 }}>
              {'\u2248 '}Future USD: {fmtUSD(est.fee * FUTURE_USD_PER_SAT)}
            </div>
            {totalAmount > 0 && (
              <>
                <div className="subtle" style={{ marginTop: 4 }}>
                  Total debit: {totalAmount + PLATFORM_FEE_SATS + est.fee} sats ({btcUsd ? <>{'\u2248 '}{fmtUSD((totalAmount + PLATFORM_FEE_SATS + est.fee) * usdPerSat)}</> : 'USD n/a'}, {fmtBTC(totalAmount + PLATFORM_FEE_SATS + est.fee)})
                </div>
                <div className="subtle" style={{ marginTop: 2 }}>
                  {'\u2248 '}Future USD: {fmtUSD((totalAmount + PLATFORM_FEE_SATS + est.fee) * FUTURE_USD_PER_SAT)}
                </div>
              </>
            )}
          </>
        )}

        {utxos && utxos.length > 0 && (
          <div className="subtle" style={{ marginTop: 4 }}>
            UTXOs: {utxos.length} {'\u00B7'} Total: {utxoTotal} sats {'\u00B7'} Max spendable: {feeRate ? maxSpendable(utxos as any, feeRate, Math.max(2, addresses.length + 1)) : '\u2014'} sats
          </div>
        )}

        {error && <div className="alert" style={{ marginTop: 8 }}>{error}</div>}

        {txid && (
          <div className="ok" style={{ marginTop: 8 }}>
            Sent! Txid: <span className="mono">{txid}</span>
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(txid!) } catch {} }}>Copy txid</button>
              <a className="btn" href={`https://blockstream.info/tx/${txid}`} target="_blank" rel="noreferrer">View on explorer</a>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={loadUtxos} disabled={busy}>Refresh UTXOs</button>
          <button className="btn" onClick={onUseMax} disabled={busy || !feeRate || !utxos.length}>Use Max</button>
          <button className="btn btn-primary" onClick={openConfirm} disabled={busy || !feeRate}>{busy ? 'Sending...' : 'Send'}</button>
          <button className="btn" onClick={onCreatePsbt} disabled={busy || !feeRate}>{busy ? '...' : 'Create PSBT'}</button>
        </div>
      </WindowShell>

      <WindowShell id="sendPsbt" title="External signing (PSBT)" className="mt-12">
        <p className="subtle" style={{ marginTop: 4 }}>Export an unsigned PSBT to sign on a hardware or external signer. Then paste the signed PSBT to broadcast.</p>
        <label style={{ display: 'block', marginTop: 8 }}>
          Unsigned PSBT (base64)
          <textarea className="textarea" rows={3} value={unsignedPsbt} readOnly placeholder="Generate a PSBT to see it here" />
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          Signed PSBT (base64)
          <textarea className="textarea" rows={3} value={signedPsbt} onChange={(e) => setSignedPsbt(e.target.value)} placeholder="Paste signed PSBT from external signer" />
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" onClick={onBroadcastSigned} disabled={busy}>Broadcast signed PSBT</button>
          {psbtStatus && <div className="badge">{psbtStatus}</div>}
        </div>
      </WindowShell>
      <QrScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={(value) => {
          const res = parsePayment(value)
          setAddrListRaw(prev => (prev ? `${prev.trim()}\n${res.addr}` : res.addr))
          if (res.sats && res.sats > 0) setTotalSats(String(res.sats))
          setScanOpen(false)
        }}
        windowId="sendScanMainnet"
        title="Scan payment QR"
        helperText="Scan a bitcoin: URI or address QR to fill the destination (amount is read if present)."
      />

      {confirmOpen && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <WindowShell id="sendConfirmMainnet" title="Review & Sign" style={{ width: 'min(560px, 92vw)' }}>
            <div className="kv">Please verify the transaction details before signing.</div>
            <div className="mt-12" style={{ borderTop: '1px solid rgba(148,163,184,0.15)' }} />

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <div className="kv">From</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: '65%', justifyContent: 'flex-end' }}>
                <div className="mono" style={{ overflowWrap: 'anywhere' }}>{fromAddress}</div>
                <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(fromAddress) } catch {} }}>Copy</button>
              </div>
            </div>

            <div className="kv" style={{ marginTop: 8 }}>Recipients</div>
            <div className="scroll" style={{ maxHeight: 200, paddingRight: 4 }}>
              {targets.map((t, i) => (
                <div key={`${t.address}-${i}`} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                  <div className="mono" style={{ maxWidth: '60%', overflowWrap: 'anywhere' }}>{t.address}</div>
                  <div className="mono">{t.value} sats</div>
                </div>
              ))}
            </div>

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <div className="kv">Amount total</div>
              <div className="mono">{totalAmount} sats</div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <div className="kv">{'\u2248 '}USD</div>
              <div className="mono">{btcUsd ? fmtUSD(totalAmount * usdPerSat) : 'USD n/a'}</div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <div className="kv">{'\u2248 '}Future USD</div>
              <div className="mono">{fmtUSD(totalAmount * FUTURE_USD_PER_SAT)}</div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <div className="kv">{'\u2248 '}BTC</div>
              <div className="mono">{fmtBTC(totalAmount)}</div>
            </div>

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <div className="kv">Platform fee</div>
              <div className="mono">{PLATFORM_FEE_SATS} sats</div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <div className="kv">{'\u2248 '}USD</div>
              <div className="mono">{btcUsd ? fmtUSD(PLATFORM_FEE_SATS * usdPerSat) : 'USD n/a'}</div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <div className="kv">{'\u2248 '}Future USD</div>
              <div className="mono">{fmtUSD(PLATFORM_FEE_SATS * FUTURE_USD_PER_SAT)}</div>
            </div>

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <div className="kv">Fee rate</div>
              <div className="mono">{feeRate} sat/vB</div>
            </div>

            {est && (
              <>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                  <div className="kv">Miner fee</div>
                  <div className="mono">{est.fee} sats</div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                  <div className="kv">{'\u2248 '}USD</div>
                  <div className="mono">{btcUsd ? fmtUSD(est.fee * usdPerSat) : 'USD n/a'}</div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                  <div className="kv">{'\u2248 '}BTC</div>
                  <div className="mono">{fmtBTC(est.fee)}</div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                  <div className="kv">Total debit</div>
                  <div className="mono">{totalAmount + PLATFORM_FEE_SATS + est.fee} sats</div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                  <div className="kv">{'\u2248 '}USD</div>
                  <div className="mono">{btcUsd ? fmtUSD((totalAmount + PLATFORM_FEE_SATS + est.fee) * usdPerSat) : 'USD n/a'}</div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                  <div className="kv">{'\u2248 '}BTC</div>
                  <div className="mono">{fmtBTC(totalAmount + PLATFORM_FEE_SATS + est.fee)}</div>
                </div>
              </>
            )}

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={onConfirmSend} disabled={busy}>{busy ? 'Signing...' : 'Sign &amp; Send'}</button>
            </div>
          </WindowShell>
        </div>
      )}
    </section>
  )
}

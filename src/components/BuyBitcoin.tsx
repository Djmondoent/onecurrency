import React, { useEffect, useRef, useState } from 'react'
import WindowShell from './WindowShell'
import { isValidAddress } from '../lib/wallet.mainnet'
import { createFundingCheckout, getFundingConfig, FundingConfig, FundingCurrency, FundingMethod } from '../lib/funding'

export default function BuyBitcoin({ address, onRefresh }: { address: string; onRefresh: () => Promise<void> }) {
  const [config, setConfig] = useState<FundingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('100')
  const [currency, setCurrency] = useState<FundingCurrency>('auto')
  const [method, setMethod] = useState<FundingMethod>('any')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checkout, setCheckout] = useState('')
  const [refreshStatus, setRefreshStatus] = useState('')
  const pending = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  const validAddress = isValidAddress(address)

  useEffect(() => {
    const controller = new AbortController()
    let mounted = true
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    getFundingConfig(controller.signal).then(value => { if (mounted) setConfig(value) }).catch(() => {
      if (!controller.signal.aborted) setConfig(null)
    }).finally(() => {
      window.clearTimeout(timeout)
      if (mounted) setLoading(false)
    })
    return () => { mounted = false; controller.abort(); window.clearTimeout(timeout) }
  }, [])

  // A new destination or purchase choice always requires a fresh review and URL.
  useEffect(() => {
    pending.current?.abort()
    pending.current = null
    inFlight.current = false
    setBusy(false)
    setCheckout('')
    setConsent(false)
    setError('')
    return () => { pending.current?.abort(); pending.current = null }
  }, [address, currency, amount, method])

  useEffect(() => {
    if (!checkout) return
    const timer = window.setTimeout(() => {
      setCheckout('')
      setError('Please prepare a fresh checkout before continuing.')
    }, 3 * 60 * 1000)
    return () => window.clearTimeout(timer)
  }, [checkout])

  async function prepareCheckout(event: React.FormEvent) {
    event.preventDefault()
    if (!config?.enabled || !validAddress || !consent || inFlight.current) return
    const numericAmount = currency === 'auto' ? null : Number(amount)
    if (currency !== 'auto' && (!Number.isSafeInteger(numericAmount) || numericAmount! < 1 || numericAmount! > 100000)) {
      setError('Enter a whole currency amount between 1 and 100,000.'); return
    }
    inFlight.current = true
    setBusy(true)
    setError('')
    const controller = new AbortController()
    pending.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const url = await createFundingCheckout({ address, network: 'mainnet', amount: numericAmount, currency, method, consent: true }, config.environment, controller.signal)
      if (!controller.signal.aborted) setCheckout(url)
    } catch (cause) {
      if (pending.current === controller) setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Checkout timed out. Please try again.')
    } finally {
      window.clearTimeout(timeout)
      if (pending.current === controller) { setBusy(false); inFlight.current = false }
    }
  }

  return (
    <WindowShell id="buyBitcoin" title="Buy Bitcoin">
      <p>Buy BTC with a bank account, debit card, or credit card and have it delivered to this wallet.</p>
      <p className="subtle">MoonPay handles payment, identity verification, exchange rates, and delivery. Payment methods, fees, limits, and countries are confirmed at checkout.</p>
      <div className="note" role="status" style={{ marginTop: 12 }}>
        {loading ? 'Checking purchase availability…' : !config?.enabled ? 'Bank and card purchases are not available yet. You can still receive BTC using your wallet address.' :
          config.environment === 'sandbox' ? 'Test checkout — no real payment or Bitcoin delivery.' : 'Bitcoin mainnet · purchases deliver real BTC.'}
      </div>
      <div className="kv" style={{ marginTop: 16 }}>Bitcoin delivery address</div>
      <div className="mono" translate="no" style={{ overflowWrap: 'anywhere', marginTop: 4 }}>{address || 'Unlock your mainnet wallet to get an address.'}</div>
      {!validAddress && <p className="alert">A valid Bitcoin mainnet address is required before buying.</p>}
      <form onSubmit={prepareCheckout} style={{ marginTop: 16 }}>
        <fieldset disabled={loading || !config?.enabled || busy || !validAddress} style={{ border: 0, padding: 0, margin: 0 }}>
          <label style={{ display: 'block' }}>Pay in
            <select className="input" value={currency} onChange={event => setCurrency(event.target.value as FundingCurrency)}>
              <option value="auto">Choose local currency and amount at checkout</option>
              <option value="usd">US dollars (USD)</option><option value="eur">Euros (EUR)</option><option value="gbp">British pounds (GBP)</option>
            </select>
          </label>
          {currency !== 'auto' && <label style={{ display: 'block', marginTop: 12 }}>Purchase amount ({currency.toUpperCase()})
            <input className="input" type="number" min={1} max={100000} step={1} required value={amount} onChange={event => setAmount(event.target.value)} />
          </label>}
          <label style={{ display: 'block', marginTop: 12 }}>Preferred payment method
            <select className="input" value={method} onChange={event => setMethod(event.target.value as FundingMethod)}>
              <option value="any">Choose at checkout</option><option value="bank">Bank account</option><option value="card">Debit or credit card</option>
            </select>
          </label>
          {method === 'bank' && <p className="subtle">For US bank funding, MoonPay may offer a Balance top-up with Plaid. Other regions use supported local bank methods. If your preference is unavailable, checkout shows eligible alternatives.</p>}
          <p className="subtle">Review the final BTC amount, all fees, and delivery estimate before paying. Bank payments can take several business days. Card availability depends on your issuer and location.</p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
            <input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setCheckout('') }} />
            <span>I confirm the Bitcoin delivery address above and agree to share it with MoonPay to complete my purchase.</span>
          </label>
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }} disabled={!consent || busy}>{busy ? 'Preparing checkout…' : 'Prepare secure checkout'}</button>
        </fieldset>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
      {checkout && consent && <div className="note" style={{ marginTop: 12 }}>
        <p>Your checkout is ready. Confirm the delivery address again on MoonPay.</p>
        <a className="btn btn-primary" href={checkout} target="_blank" rel="noopener noreferrer">Open MoonPay {config?.environment === 'sandbox' ? 'test ' : ''}checkout ↗</a>
      </div>}
      <p className="subtle" style={{ marginTop: 16 }}>After purchasing, return here and refresh your balance. BTC appears when the provider sends it to the Bitcoin network.</p>
      <button className="btn" type="button" disabled={busy || !validAddress || refreshStatus === 'Refreshing…'} onClick={async () => {
        setRefreshStatus('Refreshing…')
        try { await onRefresh(); setRefreshStatus('Balance refreshed. Pending purchases may still be processing.') }
        catch { setRefreshStatus('Unable to refresh. Please try again.') }
      }}>Refresh wallet balance</button>
      <p className="subtle" role="status">{refreshStatus}</p>
    </WindowShell>
  )
}

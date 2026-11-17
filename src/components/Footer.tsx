import React from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import WindowShell from './WindowShell'

const featureList = [
  { id: 'addresses', title: 'Unlimited addresses', detail: 'Spin up fresh receiving addresses for every invoice so payments stay organized and private.' },
  { id: 'formats', title: 'Legacy, Nested & Native SegWit', detail: 'Pick the address type that matches your existing wallet, POS, or customer expectations.' },
  { id: 'taproot', title: 'Taproot (P2TR)', detail: 'Use Taproot addresses for better privacy and future smart-scripting features as the network evolves.' },
  { id: 'confirmations', title: 'Fast confirmations', detail: 'Live fee context from mempool data helps transactions confirm quickly without overpaying.' },
  { id: 'hot-wallet', title: 'Convenient online hot wallet', detail: 'Stay ready to accept or send from any device with a lightweight, browser-friendly wallet.' },
  { id: 'backup', title: 'Encrypted backups + QR export', detail: 'Export encrypted JSON and QR codes so you can restore or hand off securely in seconds.' },
  { id: 'sweep', title: 'Sweep before wipe', detail: 'Empty the wallet safely before resetting a device or rotating hardware for staff.' },
  { id: 'bulk-send', title: 'Bulk send', detail: 'Paste mixed address types, split a total evenly, and send with one platform fee and one miner fee.' },
  { id: 'send-anywhere', title: 'Send BTC anywhere', detail: 'Broadcast from anywhere with internet—no custodial accounts or approvals required.' },
  { id: 'unconfirmed', title: 'Unconfirmed sends (advanced)', detail: 'Optionally push zero-conf transactions when speed matters and risk is understood.' },
]

const howToList = [
  { id: 'create', title: 'Create or import', detail: 'Start with a new seed or import an existing one to keep full control of your funds.' },
  { id: 'choose', title: 'Choose address type', detail: 'Select Legacy, SegWit, or Taproot so your wallet matches your other tools and counterparties.' },
  { id: 'receive', title: 'Receive', detail: 'Share an address or QR code; use fresh addresses to keep payments separated.' },
  { id: 'send', title: 'Send', detail: 'Paste a destination, set amount, review fees, and confirm with confidence.' },
  { id: 'backup', title: 'Backup', detail: 'Encrypt your seed and export JSON + QR so you can restore quickly on any device.' },
  { id: 'wipe', title: 'Wipe or rotate', detail: 'Optionally sweep remaining funds, then wipe the wallet when rotating devices or staff.' },
]

type FooterProps = {
  variant?: 'advanced' | 'beginner'
}

export default function Footer({ variant = 'advanced' }: FooterProps) {
  const [activeFeature, setActiveFeature] = React.useState(featureList[0].id)
  const currentFeature = featureList.find((f) => f.id === activeFeature) || featureList[0]
  const [activeHowTo, setActiveHowTo] = React.useState(howToList[0].id)
  const currentHowTo = howToList.find((step) => step.id === activeHowTo) || howToList[0]
  const donationAddress = '12hisDmJtRtDdtP3UPJTvBDDt8bARhycdr'

  return (
    <footer style={{ marginTop: 24, padding: '16px 0', borderTop: '1px solid rgba(148,163,184,0.15)', color: '#94a3b8', lineHeight: 1.6 }}>
      {variant === 'advanced' && (
        <>
          <div className="kv" style={{ fontWeight: 600, color: '#e2e8f0' }}>Features</div>
          <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
            {featureList.map((f) => <li key={f.id}>{f.title}</li>)}
          </ul>
          <div className="kv" style={{ fontWeight: 600, color: '#e2e8f0', marginTop: 12 }}>How To Use</div>
          <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
            {howToList.map((s) => <li key={s.id}>{s.title}</li>)}
          </ul>
          <div className="kv" style={{ fontWeight: 600, color: '#e2e8f0', marginTop: 12 }}>Guides</div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            <a className="btn" href="/tutorial.html">Quick Start Tutorial</a>
            <a className="btn" href="/faq.html">FAQ</a>
          </div>
          <div className="subtle" style={{ marginTop: 8 }}>Non-custodial. No sign-up. Keep your seed safe.</div>
        </>
      )}

      {variant === 'beginner' && (
        <>
          <div className="kv" style={{ fontWeight: 600, color: '#e2e8f0', marginTop: 12 }}>How To Use</div>
          <div className="howto-bubbles">
            {howToList.map((step) => (
              <button
                key={step.id}
                className={`btn howto-chip ${step.id === activeHowTo ? 'is-active' : ''}`}
                onClick={() => setActiveHowTo(step.id)}
                aria-pressed={step.id === activeHowTo}
              >
                {step.title}
              </button>
            ))}
          </div>
          <WindowShell id="howto" title={currentHowTo.title} className="howto-card">
            <div className="subtle" style={{ marginTop: 6, color: '#cbd5e1' }}>{currentHowTo.detail}</div>
          </WindowShell>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <a className="btn" href="/tutorial.html">Quick Start Tutorial</a>
            <a className="btn" href="/faq.html">FAQ</a>
          </div>
          <div className="subtle" style={{ marginTop: 8 }}>Non-custodial. No sign-up. Keep your seed safe.</div>
        </>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="kv" style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Spread the word</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href="https://twitter.com/intent/tweet?text=Check%20this%20new%20bitcoin%20wallet%20for%20the%20future%20%40onecurrency1&url=https%3A%2F%2Fonecurrency.net"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '8px 12px', background: '#0ea5e9', color: '#0b1220', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}
          >
            Tweet @onecurrency1
          </a>
          <a
            href="https://www.instagram.com/onecurrency/"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '8px 12px', background: '#e879f9', color: '#0b1220', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}
          >
            Instagram @onecurrency
          </a>
          <a
            href="https://www.facebook.com/onecurrency"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '8px 12px', background: '#38bdf8', color: '#0b1220', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}
          >
            Facebook OneCurrency
          </a>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="kv" style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Donate BTC</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="qr-wrap">
            <QRCodeCanvas value={donationAddress} size={168} includeMargin={true} />
          </div>
          <div>
            <div className="subtle">
              If you like this project, consider donating to support the developers and keep the free Bitcoin faucet running. Thank you.
            </div>
            <div className="mono" style={{ marginTop: 6, wordBreak: 'break-all' }}>{donationAddress}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={async () => { try { await navigator.clipboard.writeText(donationAddress) } catch {} }}
              >
                Copy address
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

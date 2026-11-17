import React, { useEffect, useRef, useState } from 'react'
import { getEmail, saveEmail, getAddressType, setAddressType, AddressType } from '../lib/storage'
import { generateMnemonic } from '../lib/mnemonic'
import { encryptMnemonic, decryptMnemonic } from '../lib/crypto'
import QrScanner from './QrScanner'
import WindowShell from './WindowShell'

type Mode = 'beginner' | 'advanced'

export default function Onboarding({ onCreate, onImport, mode = 'beginner', networkLabel, onBackToMainnet }: { onCreate: (passphrase: string, addrType: AddressType) => Promise<void>, onImport: (m: string, passphrase: string, addrType: AddressType) => Promise<void>, mode?: Mode, networkLabel?: string, onBackToMainnet?: () => void }) {
  const isAdvanced = mode === 'advanced'
  const [showNew, setShowNew] = useState(false)
  const [mnemonic, setMnemonic] = useState('')
  const [seedSource, setSeedSource] = useState<'generated' | 'custom'>('generated')
  const [customSeed, setCustomSeed] = useState('')
  const [wordCount, setWordCount] = useState<12 | 20 | 24>(12)
  const [addrType, setAddrTypeState] = useState<AddressType>(getAddressType())
  const [ack, setAck] = useState(false)
  const [consentNew, setConsentNew] = useState(false)
  const [consentImport, setConsentImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importErr, setImportErr] = useState<string | null>(null)
  const [email, setEmail] = useState<string>(getEmail() || '')
  const [walletPassphrase, setWalletPassphrase] = useState<string>('')
  const [showWalletPassphrase, setShowWalletPassphrase] = useState(false)
  const [importPassphrase, setImportPassphrase] = useState<string>('')
  const [showImportPassphrase, setShowImportPassphrase] = useState(false)
  const [backupPassphrase, setBackupPassphrase] = useState<string>('')
  const [showBackupPassphrase, setShowBackupPassphrase] = useState(false)
  const [restoreJson, setRestoreJson] = useState<string>('')
  const [restorePw, setRestorePw] = useState<string>('')
  const [showRestorePw, setShowRestorePw] = useState(false)
  const [restoreStatus, setRestoreStatus] = useState<string>('')
  const [restoreScanOpen, setRestoreScanOpen] = useState(false)

  const customSeedRef = useRef<HTMLTextAreaElement | null>(null)
  const importTextRef = useRef<HTMLTextAreaElement | null>(null)

  const normalizeSeedInput = (text: string) => {
    const words = text.toLowerCase().match(/[a-z0-9]+/g)
    return words ? words.join(' ') : ''
  }
  const countWords = (text: string) => {
    const normalized = normalizeSeedInput(text)
    return normalized ? normalized.split(' ').length : 0
  }
  const hasValidWordCount = (text: string) => {
    const c = countWords(text)
    return c === 12 || c === 20 || c === 24
  }
  useEffect(() => {
    const el = customSeedRef.current
    if (!el) return
    const handle = () => {
      const next = el.value
      setCustomSeed((prev) => (prev === next ? prev : next))
    }
    el.addEventListener('input', handle)
    el.addEventListener('change', handle)
    return () => {
      el.removeEventListener('input', handle)
      el.removeEventListener('change', handle)
    }
  }, [])

  useEffect(() => {
    const el = importTextRef.current
    if (!el) return
    const handle = () => {
      const next = el.value
      setImportText((prev) => (prev === next ? prev : next))
    }
    el.addEventListener('input', handle)
    el.addEventListener('change', handle)
    return () => {
      el.removeEventListener('input', handle)
      el.removeEventListener('change', handle)
    }
  }, [])

  const createNew = async () => {
    setSeedSource('generated')
    setShowNew(true)
    const m = await generateMnemonic(wordCount)
    setMnemonic(m)
    setAck(false)
  }

  const startCustomSeed = () => {
    setSeedSource('custom')
    setShowNew(true)
    setAck(false)
  }

  const doUse = async () => {
    if (!ack || !consentNew) return
    const phrase = seedSource === 'custom'
      ? normalizeSeedInput(customSeed)
      : mnemonic
    if (!hasValidWordCount(phrase)) {
      alert('Recovery phrase must be 12, 20, or 24 words.')
      return
    }
    const pw = walletPassphrase.trim()
    if (!pw) { alert('Set a wallet passphrase first'); return }
    if (email) saveEmail(email)
    setAddressType(addrType)
    await onImport(phrase, pw, addrType)
  }

  const doImport = async () => {
    if (!consentImport) return
    const m = normalizeSeedInput(importTextRef.current?.value || importText)
    if (!hasValidWordCount(m)) {
      setImportErr('Recovery phrase should be 12, 20, or 24 words (custom words allowed).')
      return
    }
    const pw = importPassphrase.trim() || walletPassphrase.trim()
    if (!pw) { setImportErr('Set a passphrase to encrypt this device.'); return }
    setImportErr(null)
    setAddressType(addrType)
    await onImport(m, pw, addrType)
  }

  const currentWordCount = seedSource === 'custom'
    ? (countWords(customSeed) as 12 | 20 | 24 | undefined)
    : (mnemonic ? mnemonic.trim().split(/\s+/g).length as 12 | 20 | 24 : wordCount)
  const importWordCount = countWords(importText)
  const handleBackToMainnet = () => {
    if (onBackToMainnet) {
      onBackToMainnet()
      return
    }
    try { localStorage.setItem('app.view', 'mainnet') } catch {}
    window.location.reload()
  }

  return (
    <div className="container">
      <div className="onboarding-shell">
        <div className="hero">
          <div className="hero-row">
            <span className="pill">{networkLabel || "Mainnet"}</span>
            <span className="pill ghost">Secure setup</span>
            {onBackToMainnet && (
              <button type="button" className="btn btn-ghost" onClick={onBackToMainnet}>
                Back to Mainnet
              </button>
            )}
          </div>
          <h1>Welcome to One Currency</h1>
          <p>Protect your funds with a passphrase, then create or import a wallet in a few clear steps.</p>
          {(networkLabel === 'Testnet' || onBackToMainnet) && (
            <div className="note" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={handleBackToMainnet}>
                  Back to Mainnet Wallet
                </button>
                <span className="subtle">Skip testnet setup and return to mainnet.</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid cols-2">
          <WindowShell id="onboardingNew" title="Secure your wallet">
            <div className="eyebrow">New user</div>
            <div className="kv">Keep these basics in mind before continuing:</div>
            <ul className="kv" style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Back up your 12-, 20-, or 24-word recovery phrase — it is the only way to restore.</li>
              <li>Bitcoin transactions are permanent — double-check addresses.</li>
              <li>Follow local rules and keep your devices secure.</li>
            </ul>

            <label style={{ display: 'block', marginTop: 12 }}>
              <input type="checkbox" checked={consentNew} onChange={(e) => setConsentNew(e.target.checked)} />
              <span style={{ marginLeft: 8 }}>I understand</span>
            </label>

            <label style={{ display: 'block', marginTop: 12 }}>
              Wallet passphrase (encrypts your seed)
              <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
                <input
                  className="input"
                  type={showWalletPassphrase ? 'text' : 'password'}
                  form="noop-pass-form"
                  placeholder="Choose a passphrase you will remember"
                  value={walletPassphrase}
                  onChange={(e) => setWalletPassphrase(e.target.value)}
                />
                <button type="button" className="btn" onClick={() => setShowWalletPassphrase(v => !v)}>
                  {showWalletPassphrase ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="subtle" style={{ marginTop: 4 }}>Required for create/import. Keep it safe.</div>
            </label>

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="kv" style={{ fontWeight: 600, color: 'var(--text)' }}>Recovery phrase length</div>
              {[12, 20, 24].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`btn ${wordCount === count ? 'btn-primary' : ''}`}
                  onClick={() => setWordCount(count as 12 | 20 | 24)}
                  aria-pressed={wordCount === count}
                >
                  {count} words
                </button>
              ))}
            </div>

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="kv" style={{ fontWeight: 600, color: 'var(--text)' }}>Default address type</div>
              {(['legacy','nested-segwit','native-segwit','taproot'] as AddressType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn ${addrType === t ? 'btn-primary' : ''}`}
                  onClick={() => setAddrTypeState(t)}
                  aria-pressed={addrType === t}
                >
                  {t === 'legacy' && 'Legacy (1...)'}
                  {t === 'nested-segwit' && 'Nested (3/2...)'}
                  {t === 'native-segwit' && 'Native (bc1q/tb1q)'}
                  {t === 'taproot' && 'Taproot (bc1p/tb1p)'}
                </button>
              ))}
            </div>

            {!showNew && (
              <div className="surface-soft mt-12" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="kv" style={{ fontWeight: 600, color: 'var(--text)' }}>Create a new wallet</div>
                    <div className="kv">Generate a fresh {wordCount}-word phrase or provide your own 12/20/24 words.</div>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" disabled={!consentNew} onClick={createNew}>Generate</button>
                    <button className="btn" disabled={!consentNew} onClick={startCustomSeed}>Custom seed</button>
                  </div>
                </div>
              </div>
            )}

            {showNew && (
              <div className="surface-soft mt-12" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="seed-header">
                  <div className="badge" style={{ fontWeight: 600, marginBottom: 0 }}>
                    {seedSource === 'custom' ? 'Enter your custom recovery phrase' : `Your ${currentWordCount}-word recovery phrase`}
                  </div>
                  <div className="subtle">Write these down in order. Anyone with these words can spend your funds.</div>
                </div>
                {seedSource === 'custom' ? (
                  <>
                    <textarea
                      className="textarea"
                      rows={3}
                      placeholder="type any 12, 20, or 24 words you control"
                      value={customSeed}
                      onChange={(e) => setCustomSeed(e.target.value)}
                      ref={customSeedRef}
                    />
                    <div className="kv" style={{ color: hasValidWordCount(customSeed) || !customSeed ? 'var(--muted)' : 'var(--warn, #f59e0b)' }}>
                      Word count: {countWords(customSeed)} (need 12, 20, or 24)
                    </div>
                  </>
                ) : (
                  <div className="mono" style={{ background: '#0b0d16', padding: 12, borderRadius: 12, lineHeight: 1.7, border: '1px solid rgba(255,255,255,0.06)' }}>
                    {mnemonic}
                  </div>
                )}
                {isAdvanced && (
                  <>
                    <label style={{ display: 'block', marginTop: 4 }}>
                      Email (optional, stored locally)
                      <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                    <div className="note mt-12">
                      <div className="warn">Emailing recovery words is unsafe. Prefer encrypted backup.</div>
                      <label style={{ display: 'block', marginTop: 8 }}>
                        Passphrase for encrypted backup
                        <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
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
                        <div className="subtle" style={{ marginTop: 4 }}>Use a strong passphrase and store it securely.</div>
                      </label>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="btn" onClick={() => {
                          if (!email) return alert('Enter your email first')
                          const ok = confirm('This is insecure. Do you still want to open an email draft with your recovery words?')
                          if (!ok) return
                          const to = encodeURIComponent(email)
                          const subject = encodeURIComponent('One Currency Testnet Wallet seed (UNSAFE)')
                          const words = seedSource === 'custom' ? customSeed.trim().replace(/\s+/g, ' ') : mnemonic
                          const body = encodeURIComponent(`Your recovery words (UNSAFE):\n${words}\n\nKeep these secret. Anyone with these can spend your funds.`)
                          const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`
                          window.open(gmailUrl, '_blank')
                        }}>
                          Email Recovery Words (Gmail)
                        </button>
                        <button className="btn" onClick={() => {
                          if (!email) return alert('Enter your email first')
                          const ok = confirm('This is insecure. Do you still want to open your mail app with your recovery words?')
                          if (!ok) return
                          const to = encodeURIComponent(email)
                          const subject = encodeURIComponent('One Currency Testnet Wallet seed (UNSAFE)')
                          const words = seedSource === 'custom' ? customSeed.trim().replace(/\s+/g, ' ') : mnemonic
                          const body = encodeURIComponent(`Your recovery words (UNSAFE):\n${words}\n\nKeep these secret. Anyone with these can spend your funds.`)
                          window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
                        }}>
                          Email Recovery Words (Default)
                        </button>
                      </div>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button
                          className="btn"
                          onClick={async () => {
                            if (!email) return alert('Enter your email first')
                            try {
                              const pass = backupPassphrase.trim()
                              if (!pass) return alert('Enter a passphrase for the encrypted backup')
                              const words = seedSource === 'custom' ? customSeed.trim().replace(/\s+/g, ' ') : mnemonic
                              const json = await encryptMnemonic(words, pass)
                              const to = encodeURIComponent(email)
                              const subject = encodeURIComponent('One Currency encrypted backup')
                              const body = encodeURIComponent(`Encrypted backup (JSON):\n${json}\n\nKeep this email safe. You will need your passphrase to decrypt.`)
                              const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`
                              window.open(gmailUrl, '_blank')
                            } catch (e: any) {
                              alert(e?.message || 'Failed to create encrypted backup')
                            }
                          }}
                        >
                          Email Encrypted Backup (Gmail)
                        </button>
                        <button
                          className="btn"
                          onClick={async () => {
                            if (!email) return alert('Enter your email first')
                            try {
                              const pass = backupPassphrase.trim()
                              if (!pass) return alert('Enter a passphrase for the encrypted backup')
                              const words = seedSource === 'custom' ? customSeed.trim().replace(/\s+/g, ' ') : mnemonic
                              const json = await encryptMnemonic(words, pass)
                              const to = encodeURIComponent(email)
                              const subject = encodeURIComponent('One Currency encrypted backup')
                              const body = encodeURIComponent(`Encrypted backup (JSON):\n${json}\n\nKeep this email safe. You will need your passphrase to decrypt.`)
                              window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
                            } catch (e: any) {
                              alert(e?.message || 'Failed to create encrypted backup')
                            }
                          }}
                        >
                          Email Encrypted Backup (Default)
                        </button>
                      </div>
                    </div>
                  </>
                )}
                <label style={{ display: 'block', marginTop: 8 }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I wrote these down and will keep them safe.
                </label>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={doUse} disabled={!ack || !consentNew}>Use This Seed</button>
                </div>
              </div>
            )}
          </WindowShell>

          <WindowShell id="onboardingReturning" title="Import or restore" bodyClassName="window-body-stack">
            <div className="eyebrow">Returning user</div>
            <div className="kv">Already have a wallet? Paste any 12, 20, or 24 words (custom phrases allowed) or restore an encrypted backup.</div>
            <label style={{ display: 'block', marginTop: 8 }}>
              <input type="checkbox" checked={consentImport} onChange={(e) => setConsentImport(e.target.checked)} />
              <span style={{ marginLeft: 8 }}>I understand</span>
            </label>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="kv" style={{ fontWeight: 600, color: 'var(--text)' }}>Default address type</div>
              {(['legacy','nested-segwit','native-segwit','taproot'] as AddressType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn ${addrType === t ? 'btn-primary' : ''}`}
                  onClick={() => setAddrTypeState(t)}
                  aria-pressed={addrType === t}
                >
                  {t === 'legacy' && 'Legacy (1...)'}
                  {t === 'nested-segwit' && 'Nested (3/2...)'}
                  {t === 'native-segwit' && 'Native (bc1q/tb1q)'}
                  {t === 'taproot' && 'Taproot (bc1p/tb1p)'}
                </button>
              ))}
            </div>

            <div className="surface-soft" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="badge" style={{ marginBottom: 0 }}>Import existing wallet</div>
              <textarea
                className="textarea"
                rows={3}
                placeholder="enter recovery phrase (12, 20, or 24 words)"
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value)
                  if (importErr) setImportErr(null)
                }}
                ref={importTextRef}
              />
              <div className="kv" style={{ color: importWordCount === 0 || importWordCount === 12 || importWordCount === 20 || importWordCount === 24 ? 'var(--muted)' : 'var(--warn, #f59e0b)' }}>
                Word count: {importWordCount} (need 12, 20, or 24)
              </div>
              {importErr && <div className="alert" style={{ marginTop: 4 }}>{importErr}</div>}
              <label style={{ display: 'block' }}>
                Passphrase for this device
                <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <input
                    className="input"
                    type={showImportPassphrase ? 'text' : 'password'}
                    form="noop-pass-form"
                    placeholder="Passphrase to encrypt after import"
                    value={importPassphrase}
                    onChange={(e) => setImportPassphrase(e.target.value)}
                  />
                  <button type="button" className="btn" onClick={() => setShowImportPassphrase(v => !v)}>{showImportPassphrase ? 'Hide' : 'Show'}</button>
                </div>
              </label>
              <div className="row" style={{ marginTop: 4 }}>
                <button className="btn btn-primary" disabled={!consentImport} onClick={doImport}>Import / Custom seed restore</button>
              </div>
            </div>

            <div className="surface-soft" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="badge" style={{ marginBottom: 0 }}>Restore encrypted backup</div>
              <label style={{ display: 'block' }}>
                Encrypted JSON
                <textarea className="textarea" rows={4} placeholder='Paste your backup JSON here' value={restoreJson} onChange={(e) => setRestoreJson(e.target.value)} />
              </label>
              <label style={{ display: 'block' }}>
                Backup password (used to decrypt)
                <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <input className="input" type={showRestorePw ? 'text' : 'password'} form="noop-pass-form" placeholder='Password set when you created the backup' value={restorePw} onChange={(e) => setRestorePw(e.target.value)} />
                  <button type="button" className="btn" onClick={() => setShowRestorePw(v => !v)}>{showRestorePw ? 'Hide' : 'Show'}</button>
                </div>
                <div className="subtle" style={{ marginTop: 4 }}>You only need this one password to decrypt JSON or QR backups.</div>
              </label>
              <div className="row" style={{ marginTop: 4 }}>
                <button className="btn" onClick={() => setRestoreScanOpen(true)}>Scan QR</button>
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
                <button className="btn" onClick={async () => {
                  setRestoreStatus('')
                  try {
                    if (!restoreJson.trim() || !restorePw) { setRestoreStatus('Enter JSON and password'); return }
                    const m = await decryptMnemonic(restoreJson.trim(), restorePw)
                    const words = m.trim().split(/\s+/g)
                    if (!hasValidWordCount(m)) {
                      setRestoreStatus(`Decrypted (${words.length} words). Need 12, 20, or 24.`)
                      return
                    }
                    const preview = `${words.slice(0,4).join(' ')} ... ${words.slice(-4).join(' ')}`
                    setRestoreStatus(`Looks good: ${preview}`)
                  } catch (e: any) {
                    setRestoreStatus(e?.message || 'Failed to decrypt backup')
                  }
                }}>Validate Only</button>
                <button className="btn btn-primary" disabled={!consentImport} onClick={async () => {
                  setRestoreStatus('')
                  try {
                    if (!restoreJson.trim() || !restorePw) { setRestoreStatus('Enter JSON and password'); return }
                    const m = await decryptMnemonic(restoreJson.trim(), restorePw)
                    if (!hasValidWordCount(m)) { setRestoreStatus('Decryption succeeded but phrase is not 12, 20, or 24 words'); return }
                    await onImport(m, restorePw, addrType)
                    setRestoreStatus('Decrypted and imported wallet (using the same password)')
                  } catch (e: any) {
                    setRestoreStatus(e?.message || 'Failed to decrypt backup')
                  }
                }}>Decrypt & Import</button>
              </div>
              {restoreStatus && <div className="badge" style={{ marginTop: 4 }}>{restoreStatus}</div>}
            </div>
          </WindowShell>
        </div>

        <QrScanner
          open={restoreScanOpen}
          onClose={() => setRestoreScanOpen(false)}
          onResult={(v) => {
            setRestoreJson(v)
            setRestoreStatus('Scanned QR from camera')
            setRestoreScanOpen(false)
          }}
          title="Scan Encrypted Backup QR"
          helperText="Point your camera at the encrypted backup QR. We only read this locally."
        />
      </div>
    </div>
  )
}

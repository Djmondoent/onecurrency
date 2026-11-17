import React, { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { getAddressType, setAddressType, AddressType, getMnemonic, unlockMnemonic } from '../../lib/storage.mainnet'
import { generateMnemonic, isLegacyTwentyWordMnemonic, isSupportedMnemonic, normalizeMnemonic } from '../../lib/wallet.mainnet'
import { encryptMnemonic, decryptMnemonic } from '../../lib/crypto'
import QrScanner from '../QrScanner'
import WindowShell from '../WindowShell'

type Mode = 'beginner' | 'advanced'
type Stage = 'welcome' | 'explain' | 'create' | 'restore' | 'backup' | 'success'
type Journey = 'create' | 'restore' | null
type RestoreMethod = 'phrase' | 'encrypted' | 'qr'

type Props = {
  onCreate: (passphrase: string, addrType: AddressType, mnemonicOverride?: string) => Promise<boolean>
  onImport: (m: string, passphrase: string, addrType: AddressType) => Promise<boolean>
  onDone: () => void
  mode?: Mode
  initialStage?: 'welcome' | 'backup'
}

const WORD_OPTIONS: Array<12 | 24> = [12, 24]

export default function OnboardingMain({
  onCreate,
  onImport,
  onDone,
  mode = 'beginner',
  initialStage = 'welcome',
}: Props) {
  const isAdvancedMode = mode === 'advanced'
  const [stage, setStage] = useState<Stage>(initialStage === 'backup' ? 'backup' : 'welcome')
  const [journey, setJourney] = useState<Journey>(initialStage === 'backup' ? 'create' : null)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(isAdvancedMode)
  const [addrType, setAddrTypeState] = useState<AddressType>(getAddressType())
  const [wordCount, setWordCount] = useState<12 | 24>(12)
  const [walletPassword, setWalletPassword] = useState('')
  const [showWalletPassword, setShowWalletPassword] = useState(false)
  const [useCustomPhrase, setUseCustomPhrase] = useState(false)
  const [customPhrase, setCustomPhrase] = useState('')
  const [restoreMethod, setRestoreMethod] = useState<RestoreMethod>('phrase')
  const [restorePhrase, setRestorePhrase] = useState('')
  const [restoreJson, setRestoreJson] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [showRestorePassword, setShowRestorePassword] = useState(false)
  const [actionStatus, setActionStatus] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [backupJson, setBackupJson] = useState('')
  const [backupStatus, setBackupStatus] = useState('')
  const [backupUnlockPassword, setBackupUnlockPassword] = useState('')
  const [showBackupUnlockPassword, setShowBackupUnlockPassword] = useState(false)
  const [backupTouched, setBackupTouched] = useState(false)
  const [showBackupQr, setShowBackupQr] = useState(false)

  useEffect(() => {
    if (initialStage === 'backup') {
      setJourney('create')
      setStage('backup')
    }
  }, [initialStage])

  const normalizeWords = (text: string) => {
    return normalizeMnemonic(text)
  }

  const countWords = (text: string) => {
    const normalized = normalizeWords(text)
    return normalized ? normalized.split(' ').length : 0
  }

  const isImportablePhrase = (text: string) => isSupportedMnemonic(normalizeWords(text))

  const createPhraseWordCount = useMemo(() => countWords(customPhrase), [customPhrase])
  const restorePhraseWordCount = useMemo(() => countWords(restorePhrase), [restorePhrase])

  const stepItems = useMemo(() => {
    const base = [
      { key: 'welcome', label: 'Welcome' },
      { key: 'explain', label: 'How It Works' },
      { key: journey === 'restore' ? 'restore' : 'create', label: journey === 'restore' ? 'Restore' : 'Create' },
    ]
    if (journey === 'create') base.push({ key: 'backup', label: 'Save Backup' })
    else if (stage === 'success') base.push({ key: 'success', label: 'Ready' })
    return base
  }, [journey, stage])

  const currentStepKey = stage === 'success' ? 'success' : stage

  const openCreateFlow = () => {
    setJourney('create')
    setActionStatus('')
    setSuccessMessage('')
    setStage('explain')
  }

  const openRestoreFlow = () => {
    setJourney('restore')
    setActionStatus('')
    setSuccessMessage('')
    setStage('explain')
  }

  const continueFromExplain = () => {
    if (journey === 'restore') setStage('restore')
    else setStage('create')
  }

  const ensureBackupJson = async () => {
    if (backupJson) return backupJson
    const password = (walletPassword || backupUnlockPassword).trim()
    if (!password) {
      throw new Error('Enter your wallet password first.')
    }
    let words = getMnemonic()
    if (!words) {
      words = await unlockMnemonic(password)
    }
    const json = await encryptMnemonic(words, password)
    setBackupJson(json)
    return json
  }

  const handleDownloadBackup = async () => {
    setBackupStatus('')
    try {
      const json = await ensureBackupJson()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'one-currency-wallet-backup.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setBackupTouched(true)
      setBackupStatus('Backup file downloaded. Keep it private and store it somewhere safe.')
    } catch (e: any) {
      setBackupStatus(e?.message || 'Unable to prepare your backup right now.')
    }
  }

  const handleShowBackupQr = async () => {
    setBackupStatus('')
    try {
      await ensureBackupJson()
      setShowBackupQr(true)
      setBackupTouched(true)
      setBackupStatus('Backup QR ready. Save it somewhere private before you continue.')
    } catch (e: any) {
      setBackupStatus(e?.message || 'Unable to prepare your backup QR right now.')
    }
  }

  const handleCreateWallet = async () => {
    setActionStatus('')
    const password = walletPassword.trim()
    if (!password) {
      setActionStatus('Create a wallet password for this device before you continue.')
      return
    }
    setAddressType(addrType)
    if (useCustomPhrase) {
      const phrase = normalizeWords(customPhrase)
      if (!isImportablePhrase(phrase)) {
        setActionStatus('Enter a valid 12- or 24-word BIP39 phrase, or a legacy 20-word OneCurrency phrase.')
        return
      }
      const ok = await onCreate(password, addrType, phrase)
      if (!ok) {
        setActionStatus('We could not create your wallet from that backup phrase.')
        return
      }
    } else {
      const generatedPhrase = wordCount === 12 ? undefined : await generateMnemonic(wordCount)
      const ok = await onCreate(password, addrType, generatedPhrase)
      if (!ok) {
        setActionStatus('We could not create your wallet right now.')
        return
      }
    }
    setBackupJson('')
    setBackupTouched(false)
    setShowBackupQr(false)
    setSuccessMessage('Your One Currency wallet is ready. You can now receive Bitcoin, send Bitcoin, and manage your wallet.')
    setStage('backup')
  }

  const handleRestoreWallet = async () => {
    setActionStatus('')
    setAddressType(addrType)
    if (restoreMethod === 'phrase') {
      const phrase = normalizeWords(restorePhrase)
      if (!isImportablePhrase(phrase)) {
        setActionStatus('Enter a valid 12- or 24-word BIP39 phrase, or a legacy 20-word OneCurrency phrase.')
        return
      }
      const password = walletPassword.trim()
      if (!password) {
        setActionStatus('Create a wallet password for this device before you continue.')
        return
      }
      const ok = await onImport(phrase, password, addrType)
      if (!ok) {
        setActionStatus('We could not restore that wallet right now.')
        return
      }
    } else {
      const json = restoreJson.trim()
      const password = restorePassword.trim()
      if (!json || !password) {
        setActionStatus('Paste your backup file contents and enter the backup password.')
        return
      }
      try {
        const phrase = await decryptMnemonic(json, password)
        if (!isImportablePhrase(phrase)) {
          setActionStatus('That backup opened, but the backup phrase inside is not valid.')
          return
        }
        const ok = await onImport(phrase, password, addrType)
        if (!ok) {
          setActionStatus('We could not restore that wallet right now.')
          return
        }
      } catch (e: any) {
        setActionStatus(e?.message || 'We could not open that backup.')
        return
      }
    }
    setSuccessMessage('Your One Currency wallet is ready. You can now receive Bitcoin, send Bitcoin, and manage your wallet.')
    setStage('success')
  }

  const renderAdvancedSetup = (includeWordOptions: boolean) => (
    <div className="onboarding-advanced">
      <button
        type="button"
        className="btn btn-ghost onboarding-advanced__toggle"
        onClick={() => setShowAdvanced((value) => !value)}
      >
        {showAdvanced ? 'Hide Advanced Setup' : 'Advanced Setup'}
      </button>
      {showAdvanced && (
        <div className="surface-soft onboarding-advanced__panel">
          <div className="onboarding-advanced__grid">
            <label style={{ display: 'block' }}>
              Wallet address style
              <select className="input" value={addrType} onChange={(e) => setAddrTypeState(e.target.value as AddressType)}>
                <option value="native-segwit">Native SegWit (bc1q)</option>
                <option value="nested-segwit">Nested SegWit (3...)</option>
                <option value="legacy">Legacy (1...)</option>
                <option value="taproot">Taproot (bc1p)</option>
              </select>
            </label>
          </div>
          {includeWordOptions && (
            <>
              <div className="onboarding-word-options">
                <div className="onboarding-field-label">New wallet backup phrase length</div>
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  {WORD_OPTIONS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`btn ${wordCount === count ? 'btn-primary' : ''}`}
                      onClick={() => setWordCount(count)}
                    >
                      {count} words
                    </button>
                  ))}
                </div>
              </div>
              <label className="onboarding-check">
                <input type="checkbox" checked={useCustomPhrase} onChange={(e) => setUseCustomPhrase(e.target.checked)} />
                <span>Use my own backup phrase instead of creating a new one</span>
              </label>
              {useCustomPhrase && (
                <label style={{ display: 'block' }}>
                  Your backup phrase
                  <textarea
                    className="textarea"
                    rows={4}
                    placeholder="Enter 12, 20, or 24 words you already control"
                    value={customPhrase}
                    onChange={(e) => setCustomPhrase(e.target.value)}
                  />
                  <div className="subtle" style={{ marginTop: 6 }}>
                    Word count: {createPhraseWordCount} {createPhraseWordCount > 0 && !isImportablePhrase(customPhrase) ? '(needs valid BIP39, or legacy 20-word OneCurrency)' : ''}
                    {isLegacyTwentyWordMnemonic(customPhrase) ? ' Legacy 20-word phrase detected.' : ''}
                  </div>
                </label>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="onboarding-root onboarding-shell onboarding-shell--wizard">
      <section className="hero onboarding-hero">
        <div className="hero-row">
          <span className="pill">Bitcoin only</span>
          <span className="pill ghost">Self-custody</span>
        </div>
        <h1>Welcome to One Currency</h1>
        <p>A simple Bitcoin wallet where you control your keys.</p>
      </section>

      <div className="onboarding-steps" aria-label="Setup progress">
        {stepItems.map((item, index) => {
          const isCurrent = item.key === currentStepKey
          const isComplete = stepItems.findIndex((entry) => entry.key === currentStepKey) > index
          return (
            <div key={item.key} className={`onboarding-step ${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''}`}>
              <span className="onboarding-step__index">{index + 1}</span>
              <span className="onboarding-step__label">{item.label}</span>
            </div>
          )
        })}
      </div>

      <WindowShell
        id="mainnetOnboardingWizard"
        title="One Currency Setup"
        className="onboarding-panel-shell"
        bodyClassName="window-body-stack onboarding-content"
      >
        {stage === 'welcome' && (
          <div className="onboarding-panel">
            <div className="onboarding-copy">
              <h2>Welcome to One Currency</h2>
              <p className="subtle">A simple Bitcoin wallet where you control your keys.</p>
              <p className="onboarding-note">No account. No bank login. No KYC. Your Bitcoin keys stay with you.</p>
            </div>
            <div className="onboarding-actions onboarding-actions--stack">
              <button className="btn btn-primary onboarding-main-button" type="button" onClick={openCreateFlow}>
                Create New Wallet
              </button>
              <button className="btn onboarding-main-button" type="button" onClick={openRestoreFlow}>
                Restore Existing Wallet
              </button>
            </div>
            {renderAdvancedSetup(false)}
          </div>
        )}

        {stage === 'explain' && (
          <div className="onboarding-panel">
            <div className="onboarding-copy">
              <h2>How One Currency Works</h2>
              <p className="subtle">A few quick basics before you continue.</p>
            </div>
            <div className="onboarding-grid onboarding-card-grid">
              <article className="card onboarding-card onboarding-info-card">
                <h3>You control your wallet</h3>
                <p>One Currency does not hold your Bitcoin. Your wallet backup is the key to your money.</p>
              </article>
              <article className="card onboarding-card onboarding-info-card">
                <h3>Save your backup</h3>
                <p>Write down or download your wallet backup and keep it private.</p>
              </article>
              <article className="card onboarding-card onboarding-info-card">
                <h3>Send and receive Bitcoin</h3>
                <p>After setup, you can receive Bitcoin, send Bitcoin, and manage your addresses.</p>
              </article>
            </div>
            <div className="onboarding-actions">
              <button className="btn btn-primary onboarding-main-button" type="button" onClick={continueFromExplain}>
                I Understand - Continue
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setStage('welcome')}>
                Back
              </button>
            </div>
          </div>
        )}

        {stage === 'create' && (
          <div className="onboarding-panel">
            <div className="onboarding-copy">
              <h2>Create Your Bitcoin Wallet</h2>
              <p className="subtle">We will create your wallet on this device. After that, you must save your backup.</p>
            </div>
            <label className="onboarding-field">
              <span className="onboarding-field-label">Wallet password for this device</span>
              <div className="row onboarding-input-row">
                <input
                  className="input"
                  type={showWalletPassword ? 'text' : 'password'}
                  form="noop-pass-form"
                  placeholder="Choose a password you will remember"
                  value={walletPassword}
                  onChange={(e) => setWalletPassword(e.target.value)}
                />
                <button type="button" className="btn" onClick={() => setShowWalletPassword((value) => !value)}>
                  {showWalletPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="subtle" style={{ marginTop: 6 }}>
                This password protects your wallet on this device only.
              </div>
            </label>
            {renderAdvancedSetup(true)}
            {actionStatus && <div className="alert">{actionStatus}</div>}
            <div className="onboarding-actions">
              <button className="btn btn-primary onboarding-main-button" type="button" onClick={handleCreateWallet}>
                Create My Wallet
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setStage('explain')}>
                Back
              </button>
            </div>
          </div>
        )}

        {stage === 'restore' && (
          <div className="onboarding-panel">
            <div className="onboarding-copy">
              <h2>Restore Your Wallet</h2>
              <p className="subtle">Use your saved backup to bring back your wallet.</p>
            </div>
            <div className="onboarding-choice-row">
              <button
                type="button"
                className={`btn ${restoreMethod === 'phrase' ? 'btn-primary' : ''}`}
                onClick={() => setRestoreMethod('phrase')}
              >
                Backup Phrase
              </button>
              <button
                type="button"
                className={`btn ${restoreMethod === 'encrypted' ? 'btn-primary' : ''}`}
                onClick={() => setRestoreMethod('encrypted')}
              >
                Backup File
              </button>
              <button
                type="button"
                className={`btn ${restoreMethod === 'qr' ? 'btn-primary' : ''}`}
                onClick={() => {
                  setRestoreMethod('qr')
                  setScanOpen(true)
                }}
              >
                Backup QR
              </button>
            </div>

            {restoreMethod === 'phrase' ? (
              <>
                <label className="onboarding-field">
                  <span className="onboarding-field-label">Backup phrase</span>
                  <textarea
                    className="textarea"
                    rows={4}
                    placeholder="Enter your 12, 20, or 24 backup words"
                    value={restorePhrase}
                    onChange={(e) => setRestorePhrase(e.target.value)}
                  />
                  <div className="subtle" style={{ marginTop: 6 }}>
                    Word count: {restorePhraseWordCount} {restorePhraseWordCount > 0 && !isImportablePhrase(restorePhrase) ? '(needs valid BIP39, or legacy 20-word OneCurrency)' : ''}
                    {isLegacyTwentyWordMnemonic(restorePhrase) ? ' Legacy 20-word phrase detected.' : ''}
                  </div>
                </label>
                <label className="onboarding-field">
                  <span className="onboarding-field-label">Wallet password for this device</span>
                  <div className="row onboarding-input-row">
                    <input
                      className="input"
                      type={showWalletPassword ? 'text' : 'password'}
                      form="noop-pass-form"
                      placeholder="Create a password for this device"
                      value={walletPassword}
                      onChange={(e) => setWalletPassword(e.target.value)}
                    />
                    <button type="button" className="btn" onClick={() => setShowWalletPassword((value) => !value)}>
                      {showWalletPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="onboarding-field">
                  <span className="onboarding-field-label">Backup file contents</span>
                  <textarea
                    className="textarea"
                    rows={5}
                    placeholder="Paste the backup text from your saved file or QR"
                    value={restoreJson}
                    onChange={(e) => setRestoreJson(e.target.value)}
                  />
                </label>
                <label className="onboarding-field">
                  <span className="onboarding-field-label">Backup password</span>
                  <div className="row onboarding-input-row">
                    <input
                      className="input"
                      type={showRestorePassword ? 'text' : 'password'}
                      form="noop-pass-form"
                      placeholder="Enter the password used when you saved the backup"
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                    />
                    <button type="button" className="btn" onClick={() => setShowRestorePassword((value) => !value)}>
                      {showRestorePassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setScanOpen(true)}>
                    Scan Backup QR
                  </button>
                </div>
              </>
            )}

            {renderAdvancedSetup(false)}
            {actionStatus && <div className="alert">{actionStatus}</div>}
            <div className="onboarding-actions">
              <button className="btn btn-primary onboarding-main-button" type="button" onClick={handleRestoreWallet}>
                Restore From Backup
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setStage('explain')}>
                Back
              </button>
            </div>
          </div>
        )}

        {stage === 'backup' && (
          <div className="onboarding-panel">
            <div className="onboarding-copy">
              <h2>Save Your Wallet Backup</h2>
              <p className="subtle">
                This backup is very important. If you lose it, you may lose access to your Bitcoin. Do not share it with anyone.
              </p>
            </div>
            <div className="note onboarding-note-block">
              Your backup file and QR are protected with the same wallet password you just created.
            </div>
            {!walletPassword.trim() && (
              <label className="onboarding-field">
                <span className="onboarding-field-label">Wallet password</span>
                <div className="row onboarding-input-row">
                  <input
                    className="input"
                    type={showBackupUnlockPassword ? 'text' : 'password'}
                    form="noop-pass-form"
                    placeholder="Enter your wallet password to prepare the backup"
                    value={backupUnlockPassword}
                    onChange={(e) => setBackupUnlockPassword(e.target.value)}
                  />
                  <button type="button" className="btn" onClick={() => setShowBackupUnlockPassword((value) => !value)}>
                    {showBackupUnlockPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
            )}
            <div className="onboarding-actions onboarding-actions--stack">
              <button className="btn onboarding-main-button" type="button" onClick={handleDownloadBackup}>
                Download Backup
              </button>
              <button className="btn onboarding-main-button" type="button" onClick={handleShowBackupQr}>
                Show Backup QR
              </button>
              <button
                className="btn btn-primary onboarding-main-button"
                type="button"
                disabled={!backupTouched}
                onClick={onDone}
              >
                I Saved My Backup - Go to Wallet
              </button>
            </div>
            {backupStatus && <div className="badge">{backupStatus}</div>}
            {showBackupQr && backupJson && (
              <div className="onboarding-qr-panel">
                <QRCodeCanvas value={backupJson} size={220} includeMargin={true} />
                <div className="subtle">Point another device at this QR only in a private place.</div>
              </div>
            )}
            {successMessage && <div className="note onboarding-note-block">{successMessage}</div>}
          </div>
        )}

        {stage === 'success' && (
          <div className="onboarding-panel">
            <div className="onboarding-copy">
              <h2>Your wallet is restored</h2>
              <p className="subtle">{successMessage}</p>
            </div>
            <div className="onboarding-actions">
              <button className="btn btn-primary onboarding-main-button" type="button" onClick={onDone}>
                Go to Wallet
              </button>
            </div>
          </div>
        )}
      </WindowShell>

      <QrScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={(value) => {
          setRestoreJson(value)
          setScanOpen(false)
          setRestoreMethod('qr')
          setActionStatus('Backup QR scanned. Review it, then continue.')
        }}
        title="Scan Backup QR"
        helperText="Point your camera at the saved backup QR. We read it only on this device."
      />
    </div>
  )
}

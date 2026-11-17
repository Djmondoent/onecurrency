import React, { useState } from 'react'
import WindowShell from './WindowShell'
import { useI18n } from '../i18n'

type Props = {
  network: 'mainnet' | 'testnet'
}

export default function CreditUnion({ network }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [btcAddress, setBtcAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [useCase, setUseCase] = useState('')
  const [agree, setAgree] = useState(false)
  const [status, setStatus] = useState('')

  const onSubmit = () => {
    setStatus('')
    if (!name.trim() || !email.trim() || !btcAddress.trim() || !amount.trim()) {
      setStatus(t('credit.error.missingFields'))
      return
    }
    if (!agree) {
      setStatus(t('credit.error.confirmTerms'))
      return
    }
    setStatus(t('credit.status.submitted'))
  }

  const faucetUrl = 'https://coinfaucet.eu/en/btc-testnet/' // Faucet is testnet only (audit 2026-11-17)
  const walletCta = network === 'mainnet' ? t('credit.walletCta.mainnet') : t('credit.walletCta.testnet')

  return (
    <section>
      <WindowShell id="creditHero" title={t('credit.title')} className="banner">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="subtle" style={{ marginTop: 4 }}>{t('credit.subtitle')}</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-primary" href={faucetUrl} target="_blank" rel="noreferrer">{t('credit.claimFaucet')}</a>
            <a className="btn" href="#wallet">{walletCta}</a>
          </div>
        </div>
      </WindowShell>

      <WindowShell id="creditWhy" title={t('credit.whyTitle')} className="mt-12" style={{ minHeight: 240 }}>
        <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text)', lineHeight: 1.6 }}>
          <li>{t('credit.why.bullet1')}</li>
          <li>{t('credit.why.bullet2')}</li>
          <li>{t('credit.why.bullet3')}</li>
          <li>{t('credit.why.bullet4')}</li>
          <li>{t('credit.why.bullet5')}</li>
        </ul>
        <div className="note mt-12">
          <div className="kv" style={{ fontWeight: 600 }}>{t('credit.howTitle')}</div>
          <p className="subtle" style={{ marginTop: 6 }}>
            {t('credit.howBody')}
          </p>
        </div>
      </WindowShell>

      <WindowShell id="creditApply" title={t('credit.applyTitle')} className="mt-12" style={{ minHeight: 280, maxWidth: 760, margin: '0 auto' }}>
        <label style={{ display: 'block', marginTop: 8 }}>
          {t('credit.form.name')}
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('credit.form.namePlaceholder')} />
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          {t('credit.form.email')}
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('credit.form.emailPlaceholder')} />
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          {t('credit.form.btcAddress')}
          <input className="input" value={btcAddress} onChange={(e) => setBtcAddress(e.target.value)} placeholder={network === 'mainnet' ? 'bc1...' : 'tb1...'} />
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          {t('credit.form.lineSize')}
          <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('credit.form.lineSizePlaceholder')} />
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          {t('credit.form.useCase')}
          <textarea className="textarea" rows={2} value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder={t('credit.form.useCasePlaceholder')} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className="kv">{t('credit.form.agree')}</span>
        </label>
        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onSubmit}>{t('credit.form.submit')}</button>
          {status && <div className="badge">{status}</div>}
        </div>
      </WindowShell>

      <WindowShell id="creditFlow" title={t('credit.flowTitle')} className="mt-12" style={{ borderLeft: '4px solid var(--accent)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p className="subtle" style={{ marginTop: 4, maxWidth: 620 }}>
              {t('credit.flowBody')}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn" href={faucetUrl} target="_blank" rel="noreferrer">{t('credit.openFaucet')}</a>
            <a className="btn btn-primary" href="#wallet">{t('credit.goToWallet')}</a>
          </div>
        </div>
      </WindowShell>
    </section>
  )
}

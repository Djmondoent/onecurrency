import React from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import WindowShell from './WindowShell'
import { useI18n } from '../i18n'

export default function Receive({ address, label = 'testnet' }: { address: string, label?: string }) {
  const { t } = useI18n()
  if (!address) return <div className="container">{t('receive.loading')}</div>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      alert(t('receive.copied'))
    } catch (e) {
      /* no-op */
    }
  }
  return (
    <section>
      <WindowShell id="receive" title={t('tab.receive')}>
        <div className="kv">{t('receive.addressLabel')} ({label})</div>
        <div className="row scroll" style={{ gap: 16 }}>
          <div className="qr-wrap">
            <QRCodeCanvas value={address} size={160} includeMargin={false} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="mono">{address}</div>
            <button className="btn" onClick={copy} style={{ marginTop: 8 }}>{t('common.copy')}</button>
          </div>
        </div>
      </WindowShell>
    </section>
  )
}

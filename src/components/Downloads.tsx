import React from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useI18n } from '../i18n'
import WindowShell from './WindowShell'

type DownloadItem = {
  id: string
  title: string
  desc: string
  status: string
  href?: string
  available?: boolean
  note?: string
}

export default function Downloads() {
  const { t } = useI18n()
  const appUrl = typeof window !== 'undefined' ? window.location.href : 'https://onecurrency.app'
  const shortUrl = appUrl.replace(/^https?:\/\//, '')

  const items: DownloadItem[] = [
    { id: 'pwa', title: t('downloads.webTitle'), desc: t('downloads.webDesc'), status: t('downloads.live'), href: appUrl, available: true, note: t('downloads.webNote') },
    { id: 'android', title: t('downloads.androidTitle'), desc: t('downloads.androidDesc'), status: t('downloads.live'), href: 'https://onecurrency.net/onecurrencyapkapprelease.apk', available: true },
    { id: 'chrome', title: t('downloads.chromeTitle'), desc: t('downloads.chromeDesc'), status: t('downloads.inReview') },
    { id: 'firefox', title: t('downloads.firefoxTitle'), desc: t('downloads.firefoxDesc'), status: t('downloads.coming') },
    { id: 'edge', title: t('downloads.edgeTitle'), desc: t('downloads.edgeDesc'), status: t('downloads.coming') },
    { id: 'desktop', title: t('downloads.desktopTitle'), desc: t('downloads.desktopDesc'), status: t('downloads.coming') },
    { id: 'sdk', title: t('downloads.sdkTitle'), desc: t('downloads.sdkDesc'), status: t('downloads.coming') },
  ]

  return (
    <section className="downloads">
      <div className="download-grid">
        {items.map((item) => (
          <WindowShell key={item.id} id={`download-${item.id}`} title={item.title} className="download-card">
            <div className="row space-between">
              <span className={`download-chip ${item.available ? 'is-live' : ''}`}>{item.status}</span>
            </div>
            <p className="kv" style={{ marginTop: 0 }}>{item.desc}</p>
            {item.note && <div className="kv" style={{ marginTop: 6 }}>{item.note}</div>}
            <div className="download-actions">
              {item.available && item.href ? (
                <a className="btn btn-primary" href={item.href} target="_blank" rel="noreferrer">
                  {t('downloads.open')}
                </a>
              ) : (
                <button className="btn btn-ghost" disabled aria-disabled="true">
                  {t('downloads.coming')}
                </button>
              )}
            </div>
          </WindowShell>
        ))}
      </div>
    </section>
  )
}

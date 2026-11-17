import React from 'react'
import { useI18n } from '../i18n'

type Props = {
  id: string
  title: string
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  style?: React.CSSProperties
}

export default function WindowShell({ id, title, children, className, bodyClassName, style }: Props) {
  const { t } = useI18n()
  return (
    <section className={`window ${className || ''}`.trim()} data-window-id={id} data-title={title} style={style}>
      <div className="window__header">
        <div className="window__title">{title}</div>
        <div className="window__controls">
          <button type="button" className="window__control" data-window-action="help" aria-label={t('window.help')} title={t('window.help')}>?</button>
          <button type="button" className="window__control" data-window-action="minimize" aria-label={t('window.minimize')} title={t('window.minimize')}>_</button>
          <button type="button" className="window__control" data-window-action="maximize" aria-label={t('window.maximize')} title={t('window.maximize')}>[]</button>
          <button type="button" className="window__control" data-window-action="close" aria-label={t('window.close')} title={t('window.close')}>X</button>
        </div>
      </div>
      <div className={`window__body ${bodyClassName || ''}`.trim()}>
        {children}
      </div>
    </section>
  )
}

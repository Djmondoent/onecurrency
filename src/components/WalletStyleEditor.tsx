import React, { useMemo, useState } from 'react'
import {
  WALLET_FONT_OPTIONS,
  WALLET_STYLE_TEMPLATE_OPTIONS,
  WalletStyle,
  applyTemplateToWalletStyle,
  analyzeWalletStyleContrast,
  applyWalletStyle,
  createWalletStyleCssVariables,
  getStoredWalletStyle,
  getWalletStyleTemplate,
  sanitizeWalletStyle,
  setStoredWalletStyle,
} from '../walletStyle'

const COLOR_FIELDS: Array<{ key: keyof WalletStyle; label: string }> = [
  { key: 'primaryButtonColor', label: 'Primary Button Color' },
  { key: 'secondaryButtonColor', label: 'Secondary Button Color' },
  { key: 'backgroundColor', label: 'Background Color' },
  { key: 'panelColor', label: 'Panel/Card Color' },
  { key: 'mainTextColor', label: 'Main Text Color' },
  { key: 'mutedTextColor', label: 'Muted Text Color' },
  { key: 'borderGlowColor', label: 'Border/Glow Color' },
]

function dataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(',')[1] || ''
  return Math.ceil(payload.length * 0.75)
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read that image file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not open that image file.'))
    img.src = src
  })
}

async function compressBackgroundImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a valid image file.')
  const source = await readFileAsDataUrl(file)
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image compression is not supported in this browser.')
  const attempts = [
    { max: 1600, type: 'image/webp', quality: 0.84 },
    { max: 1440, type: 'image/webp', quality: 0.78 },
    { max: 1280, type: 'image/jpeg', quality: 0.8 },
    { max: 1080, type: 'image/jpeg', quality: 0.72 },
  ]
  for (const attempt of attempts) {
    const scale = Math.min(1, attempt.max / Math.max(image.width, image.height))
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const result = canvas.toDataURL(attempt.type, attempt.quality)
    if (dataUrlBytes(result) <= 1_100_000) return result
  }
  throw new Error('That image is still too large after compression. Try a smaller image.')
}

export default function WalletStyleEditor() {
  const [savedStyle, setSavedStyle] = useState<WalletStyle>(() => getStoredWalletStyle())
  const [draftStyle, setDraftStyle] = useState<WalletStyle>(() => getStoredWalletStyle())
  const [status, setStatus] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)

  const safeDraft = useMemo(() => sanitizeWalletStyle(draftStyle), [draftStyle])
  const contrast = useMemo(() => analyzeWalletStyleContrast(safeDraft), [safeDraft])
  const previewStyle = useMemo(() => createWalletStyleCssVariables(safeDraft) as React.CSSProperties, [safeDraft])
  const isDirty = useMemo(
    () => JSON.stringify(sanitizeWalletStyle(savedStyle)) !== JSON.stringify(safeDraft),
    [savedStyle, safeDraft],
  )

  const updateDraft = (next: WalletStyle) => {
    setDraftStyle(sanitizeWalletStyle(next))
  }

  const handleTemplateSelect = (templateId: WalletStyle['templateId']) => {
    updateDraft(applyTemplateToWalletStyle(safeDraft, templateId))
    setStatus('')
  }

  const handleColorChange = (key: keyof WalletStyle, value: string) => {
    updateDraft({
      ...safeDraft,
      templateId: 'custom',
      advancedCustom: true,
      [key]: value,
    })
    setStatus('')
  }

  const handlePreview = () => {
    if (!contrast.readable) {
      setStatus(contrast.warning)
      return
    }
    applyWalletStyle(safeDraft)
    setStatus('Preview applied. Save Style to keep it after refresh.')
  }

  const handleSave = () => {
    if (!contrast.readable) {
      setStatus(contrast.warning)
      return
    }
    const applied = applyWalletStyle(safeDraft)
    if (!setStoredWalletStyle(applied)) {
      setStatus('Could not save wallet style on this device.')
      return
    }
    setSavedStyle(applied)
    setDraftStyle(applied)
    setStatus('Wallet style saved locally.')
  }

  const handleReset = () => {
    const reset = getWalletStyleTemplate('classic')
    applyWalletStyle(reset)
    if (!setStoredWalletStyle(reset)) {
      setStatus('Could not reset wallet style on this device.')
      return
    }
    setSavedStyle(reset)
    setDraftStyle(reset)
    setStatus('Wallet style reset to One Currency Classic.')
  }

  const handleRemoveBackground = () => {
    updateDraft({ ...safeDraft, backgroundImage: null })
    setStatus('Background image removed from preview.')
  }

  const handleBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    setStatus('Compressing background image...')
    try {
      const backgroundImage = await compressBackgroundImage(file)
      updateDraft({ ...safeDraft, backgroundImage, templateId: safeDraft.templateId === 'custom' ? 'custom' : safeDraft.templateId })
      setStatus('Background image ready for preview.')
    } catch (error: any) {
      setStatus(error?.message || 'Could not prepare that background image.')
    } finally {
      setUploadingImage(false)
      event.target.value = ''
    }
  }

  return (
    <div className="style-editor">
      <div className="style-editor__header">
        <div>
          <div className="style-editor__eyebrow">Wallet Style Editor</div>
          <h3 className="style-editor__title">Wallet Style Editor</h3>
          <p className="style-editor__copy">Customize your wallet colors, text style, and background without changing how your Bitcoin wallet works.</p>
          <p className="style-editor__copy style-editor__copy--muted">Make your One Currency wallet feel like your own.</p>
        </div>
        <div className="style-editor__controls">
          <button
            type="button"
            className={`btn ${safeDraft.beginnerMode ? 'btn-primary' : ''}`}
            onClick={() => updateDraft({ ...safeDraft, beginnerMode: !safeDraft.beginnerMode })}
            aria-pressed={safeDraft.beginnerMode}
          >
            {safeDraft.beginnerMode ? 'Beginner Mode: On' : 'Beginner Mode: Off'}
          </button>
          <button
            type="button"
            className={`btn ${safeDraft.advancedCustom ? 'btn-primary' : ''}`}
            onClick={() => updateDraft({ ...safeDraft, advancedCustom: !safeDraft.advancedCustom, templateId: safeDraft.advancedCustom ? safeDraft.templateId : 'custom' })}
            aria-pressed={safeDraft.advancedCustom}
          >
            {safeDraft.advancedCustom ? 'Advanced Custom: On' : 'Advanced Custom: Off'}
          </button>
        </div>
      </div>

      <div className="style-editor__section">
        <div className="style-editor__section-title">Theme Templates</div>
        <div className="style-editor__template-grid">
          {WALLET_STYLE_TEMPLATE_OPTIONS.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`style-chip ${safeDraft.templateId === template.id ? 'is-active' : ''}`}
              onClick={() => handleTemplateSelect(template.id)}
              aria-pressed={safeDraft.templateId === template.id}
            >
              {template.label}
            </button>
          ))}
        </div>
      </div>

      {safeDraft.advancedCustom && (
        <div className="style-editor__section">
          <div className="style-editor__section-title">Customize Colors</div>
          <div className="style-editor__color-grid">
            {COLOR_FIELDS.map((field) => (
              <label key={field.key} className="style-editor__field">
                <span>{field.label}</span>
                <div className="style-editor__color-input">
                  <input
                    type="color"
                    value={String(safeDraft[field.key])}
                    onChange={(event) => handleColorChange(field.key, event.target.value)}
                  />
                  <input
                    className="input"
                    type="text"
                    value={String(safeDraft[field.key])}
                    onChange={(event) => handleColorChange(field.key, event.target.value)}
                    spellCheck={false}
                  />
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="style-editor__section">
        <div className="style-editor__section-title">Background Image</div>
        <div className="style-editor__row">
          <label className="btn" style={{ cursor: uploadingImage ? 'wait' : 'pointer' }}>
            {uploadingImage ? 'Preparing Image...' : 'Upload Background'}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleBackgroundUpload} disabled={uploadingImage} />
          </label>
          <button type="button" className="btn btn-ghost" onClick={handleRemoveBackground} disabled={!safeDraft.backgroundImage}>
            Remove Background Image
          </button>
        </div>
        <div className="style-editor__slider-grid">
          <label className="style-editor__field">
            <span>Opacity: {safeDraft.backgroundOpacity}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={safeDraft.backgroundOpacity}
              onChange={(event) => updateDraft({ ...safeDraft, backgroundOpacity: Number(event.target.value) })}
            />
          </label>
          <label className="style-editor__field">
            <span>Blur: {safeDraft.backgroundBlur}px</span>
            <input
              type="range"
              min="0"
              max="24"
              value={safeDraft.backgroundBlur}
              onChange={(event) => updateDraft({ ...safeDraft, backgroundBlur: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="style-editor__row">
          <button
            type="button"
            className={`btn ${safeDraft.backgroundDarkOverlay ? 'btn-primary' : ''}`}
            onClick={() => updateDraft({ ...safeDraft, backgroundDarkOverlay: !safeDraft.backgroundDarkOverlay })}
            aria-pressed={safeDraft.backgroundDarkOverlay}
          >
            {safeDraft.backgroundDarkOverlay ? 'Dark Overlay: On' : 'Dark Overlay: Off'}
          </button>
        </div>
      </div>

      <div className="style-editor__section">
        <div className="style-editor__section-title">Font Style</div>
        <div className="style-editor__template-grid">
          {WALLET_FONT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`style-chip ${safeDraft.fontStyle === option.id ? 'is-active' : ''}`}
              onClick={() => updateDraft({ ...safeDraft, fontStyle: option.id })}
              aria-pressed={safeDraft.fontStyle === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="style-editor__section">
        <div className="style-editor__section-title">Preview</div>
        <div className="style-preview-shell" style={previewStyle}>
          <div className="style-preview">
            <div className="style-preview__top">
              <div>
                <div className="style-preview__label">Sample Wallet Card</div>
                <div className="style-preview__title">One Currency</div>
              </div>
              <div className="style-preview__badge">Premium Style</div>
            </div>
            <div className="style-preview__balance">
              <div className="style-preview__label">Sample Balance</div>
              <div className="style-preview__amount">0.02154000 BTC</div>
              <div className="style-preview__muted">Approx. 2,154,000 sats</div>
            </div>
            <div className="style-preview__buttons">
              <button type="button" className="style-preview__button style-preview__button--primary">Sample Receive</button>
              <button type="button" className="style-preview__button style-preview__button--secondary">Sample Send</button>
            </div>
            <div className="style-preview__panel">
              <div className="style-preview__text">Sample text stays readable while your wallet keeps working exactly the same.</div>
              <div className="style-preview__muted">Address, QR, backup, send, receive, and wallet security are unchanged.</div>
            </div>
          </div>
        </div>
      </div>

      {!contrast.readable && (
        <div className="alert" role="alert">
          {contrast.warning}
        </div>
      )}
      {status && (
        <div className={contrast.readable ? 'badge' : 'alert'} style={{ marginTop: 4 }}>
          {status}
        </div>
      )}

      <div className="style-editor__actions">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!contrast.readable}>
          Save Style
        </button>
        <button type="button" className="btn" onClick={handleReset}>
          Reset to Default
        </button>
        <button type="button" className="btn btn-ghost" onClick={handlePreview} disabled={!contrast.readable}>
          Preview
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleRemoveBackground} disabled={!safeDraft.backgroundImage}>
          Remove Background Image
        </button>
      </div>

      {!isDirty && (
        <div className="subtle" style={{ marginTop: 2 }}>
          Current style is already saved on this device.
        </div>
      )}
    </div>
  )
}

export type WalletStyleTemplateId =
  | 'classic'
  | 'luxury-purple'
  | 'bitcoin-gold'
  | 'midnight-black'
  | 'cyber-blue'
  | 'clean-white'
  | 'high-contrast'
  | 'custom'

export type WalletFontStyle = 'default' | 'modern' | 'luxury' | 'tech' | 'large'

export type WalletStyle = {
  templateId: WalletStyleTemplateId
  primaryButtonColor: string
  secondaryButtonColor: string
  backgroundColor: string
  panelColor: string
  mainTextColor: string
  mutedTextColor: string
  borderGlowColor: string
  backgroundImage: string | null
  backgroundOpacity: number
  backgroundBlur: number
  backgroundDarkOverlay: boolean
  fontStyle: WalletFontStyle
  beginnerMode: boolean
  advancedCustom: boolean
}

type WalletPalette = Pick<
  WalletStyle,
  | 'primaryButtonColor'
  | 'secondaryButtonColor'
  | 'backgroundColor'
  | 'panelColor'
  | 'mainTextColor'
  | 'mutedTextColor'
  | 'borderGlowColor'
>

const STORAGE_KEY = 'onecurrency.walletStyle.v1'
const DEFAULT_TEMPLATE_ID: WalletStyleTemplateId = 'classic'
const MAX_BACKGROUND_IMAGE_LENGTH = 2_000_000

const COLOR_KEYS: Array<keyof WalletPalette> = [
  'primaryButtonColor',
  'secondaryButtonColor',
  'backgroundColor',
  'panelColor',
  'mainTextColor',
  'mutedTextColor',
  'borderGlowColor',
]

const FONT_STACKS: Record<WalletFontStyle, string> = {
  default: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  modern: '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif',
  luxury: 'Baskerville, "Palatino Linotype", "Book Antiqua", Georgia, serif',
  tech: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  large: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const TEMPLATE_PALETTES: Record<Exclude<WalletStyleTemplateId, 'custom'>, WalletPalette> = {
  classic: {
    backgroundColor: '#090912',
    panelColor: '#141421',
    primaryButtonColor: '#8b5cf6',
    secondaryButtonColor: '#22c55e',
    mainTextColor: '#ffffff',
    mutedTextColor: '#b8b8c8',
    borderGlowColor: '#8b5cf6',
  },
  'luxury-purple': {
    backgroundColor: '#12071f',
    panelColor: '#1f1233',
    primaryButtonColor: '#a855f7',
    secondaryButtonColor: '#d946ef',
    mainTextColor: '#ffffff',
    mutedTextColor: '#d5c3ef',
    borderGlowColor: '#c084fc',
  },
  'bitcoin-gold': {
    backgroundColor: '#0d0b06',
    panelColor: '#1f1808',
    primaryButtonColor: '#f7931a',
    secondaryButtonColor: '#d97706',
    mainTextColor: '#fff7e6',
    mutedTextColor: '#d8c89a',
    borderGlowColor: '#f59e0b',
  },
  'midnight-black': {
    backgroundColor: '#050505',
    panelColor: '#101010',
    primaryButtonColor: '#ffffff',
    secondaryButtonColor: '#9ca3af',
    mainTextColor: '#ffffff',
    mutedTextColor: '#d1d5db',
    borderGlowColor: '#6b7280',
  },
  'cyber-blue': {
    backgroundColor: '#050b18',
    panelColor: '#0d172a',
    primaryButtonColor: '#38bdf8',
    secondaryButtonColor: '#22d3ee',
    mainTextColor: '#e0f2fe',
    mutedTextColor: '#8ecae6',
    borderGlowColor: '#38bdf8',
  },
  'clean-white': {
    backgroundColor: '#f7f7fb',
    panelColor: '#ffffff',
    primaryButtonColor: '#6d28d9',
    secondaryButtonColor: '#2563eb',
    mainTextColor: '#111827',
    mutedTextColor: '#6b7280',
    borderGlowColor: '#7c3aed',
  },
  'high-contrast': {
    backgroundColor: '#000000',
    panelColor: '#111111',
    primaryButtonColor: '#ffffff',
    secondaryButtonColor: '#fde047',
    mainTextColor: '#ffffff',
    mutedTextColor: '#f5f5f5',
    borderGlowColor: '#ffffff',
  },
}

export const WALLET_STYLE_TEMPLATE_OPTIONS: Array<{ id: WalletStyleTemplateId; label: string }> = [
  { id: 'classic', label: 'One Currency Classic' },
  { id: 'luxury-purple', label: 'Luxury Purple' },
  { id: 'bitcoin-gold', label: 'Bitcoin Gold' },
  { id: 'midnight-black', label: 'Midnight Black' },
  { id: 'cyber-blue', label: 'Cyber Blue' },
  { id: 'clean-white', label: 'Clean White' },
  { id: 'high-contrast', label: 'High Contrast' },
  { id: 'custom', label: 'Custom Theme' },
]

export const WALLET_FONT_OPTIONS: Array<{ id: WalletFontStyle; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'modern', label: 'Clean Modern' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'tech', label: 'Tech' },
  { id: 'large', label: 'Simple Large Text' },
]

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function normalizeHexColor(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return fallback
}

function isTemplateId(value: unknown): value is WalletStyleTemplateId {
  return typeof value === 'string' && WALLET_STYLE_TEMPLATE_OPTIONS.some((option) => option.id === value)
}

function isFontStyle(value: unknown): value is WalletFontStyle {
  return typeof value === 'string' && WALLET_FONT_OPTIONS.some((option) => option.id === value)
}

function sanitizeBackgroundImage(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(trimmed)) return null
  if (trimmed.length > MAX_BACKGROUND_IMAGE_LENGTH) return null
  return trimmed
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex, '#000000').slice(1)
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function mixHex(first: string, second: string, weight: number) {
  const a = hexToRgb(first)
  const b = hexToRgb(second)
  const ratio = clamp(weight, 0, 1)
  return rgbToHex(
    a.r + (b.r - a.r) * ratio,
    a.g + (b.g - a.g) * ratio,
    a.b + (b.b - a.b) * ratio,
  )
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

function srgbToLinear(channel: number) {
  const scaled = channel / 255
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrastRatio(first: string, second: string) {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function pickReadableText(background: string) {
  return contrastRatio('#ffffff', background) >= contrastRatio('#111827', background) ? '#ffffff' : '#111827'
}

export function getWalletStyleTemplate(templateId: WalletStyleTemplateId = DEFAULT_TEMPLATE_ID): WalletStyle {
  const resolvedTemplate =
    (templateId === 'custom' ? DEFAULT_TEMPLATE_ID : templateId) as Exclude<WalletStyleTemplateId, 'custom'>
  const palette = TEMPLATE_PALETTES[resolvedTemplate]
  return {
    templateId,
    ...palette,
    backgroundImage: null,
    backgroundOpacity: 34,
    backgroundBlur: 0,
    backgroundDarkOverlay: true,
    fontStyle: 'default',
    beginnerMode: templateId === 'high-contrast',
    advancedCustom: templateId === 'custom',
  }
}

export const DEFAULT_WALLET_STYLE = getWalletStyleTemplate(DEFAULT_TEMPLATE_ID)

export function sanitizeWalletStyle(value: unknown): WalletStyle {
  const raw = (value && typeof value === 'object') ? value as Partial<WalletStyle> : {}
  const templateId = isTemplateId(raw.templateId) ? raw.templateId : DEFAULT_TEMPLATE_ID
  const base = getWalletStyleTemplate(templateId)
  const next: WalletStyle = {
    ...base,
    templateId,
    backgroundImage: sanitizeBackgroundImage(raw.backgroundImage),
    backgroundOpacity: clamp(Number(raw.backgroundOpacity ?? base.backgroundOpacity) || base.backgroundOpacity, 0, 100),
    backgroundBlur: clamp(Number(raw.backgroundBlur ?? base.backgroundBlur) || base.backgroundBlur, 0, 24),
    backgroundDarkOverlay: raw.backgroundDarkOverlay == null ? base.backgroundDarkOverlay : !!raw.backgroundDarkOverlay,
    fontStyle: isFontStyle(raw.fontStyle) ? raw.fontStyle : base.fontStyle,
    beginnerMode: raw.beginnerMode == null ? base.beginnerMode : !!raw.beginnerMode,
    advancedCustom: raw.advancedCustom == null ? base.advancedCustom : !!raw.advancedCustom,
  }
  for (const key of COLOR_KEYS) next[key] = normalizeHexColor(raw[key], base[key])
  return next
}

export function getStoredWalletStyle() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WALLET_STYLE
    return sanitizeWalletStyle(JSON.parse(raw))
  } catch {
    return DEFAULT_WALLET_STYLE
  }
}

export function setStoredWalletStyle(style: WalletStyle) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeWalletStyle(style)))
    return true
  } catch {
    return false
  }
}

export function applyTemplateToWalletStyle(current: WalletStyle, templateId: WalletStyleTemplateId) {
  if (templateId === 'custom') {
    return sanitizeWalletStyle({ ...current, templateId: 'custom', advancedCustom: true })
  }
  const template = getWalletStyleTemplate(templateId)
  return sanitizeWalletStyle({
    ...current,
    ...template,
    templateId,
    backgroundImage: current.backgroundImage,
    backgroundOpacity: current.backgroundOpacity,
    backgroundBlur: current.backgroundBlur,
    backgroundDarkOverlay: current.backgroundDarkOverlay,
    fontStyle: current.fontStyle,
    beginnerMode: current.beginnerMode || templateId === 'high-contrast',
    advancedCustom: current.advancedCustom,
  })
}

export function analyzeWalletStyleContrast(style: WalletStyle) {
  const safe = sanitizeWalletStyle(style)
  const panelContrast = contrastRatio(safe.mainTextColor, safe.panelColor)
  const backgroundContrast = contrastRatio(safe.mainTextColor, safe.backgroundColor)
  const mutedContrast = contrastRatio(safe.mutedTextColor, safe.panelColor)
  const readable = panelContrast >= 4.5 && backgroundContrast >= 4.5 && mutedContrast >= 3
  return {
    readable,
    panelContrast,
    backgroundContrast,
    mutedContrast,
    warning: readable ? '' : 'This color combination may be hard to read.',
  }
}

export function createWalletStyleCssVariables(style: WalletStyle) {
  const safe = sanitizeWalletStyle(style)
  const accentGlow = safe.borderGlowColor
  const cardSoft = mixHex(safe.panelColor, safe.backgroundColor, 0.38)
  const fieldBg = mixHex(safe.panelColor, safe.backgroundColor, 0.22)
  const noteBg = mixHex(safe.panelColor, safe.backgroundColor, 0.15)
  const seedBg = mixHex(safe.backgroundColor, '#000000', 0.24)
  const accent2 = mixHex(safe.primaryButtonColor, '#ffffff', safe.backgroundColor === '#f7f7fb' ? 0.12 : 0.22)
  const heroStart = mixHex(safe.primaryButtonColor, safe.panelColor, 0.56)
  const heroEnd = mixHex(safe.secondaryButtonColor, safe.backgroundColor, 0.76)
  const panelEdge = rgba(accentGlow, safe.beginnerMode ? 0.38 : 0.28)
  const fontScale = safe.fontStyle === 'large' ? 1.08 : 1
  const totalScale = safe.beginnerMode ? fontScale * 1.08 : fontScale
  return {
    '--oc-bg': safe.backgroundColor,
    '--oc-panel': safe.panelColor,
    '--oc-primary': safe.primaryButtonColor,
    '--oc-secondary': safe.secondaryButtonColor,
    '--oc-text': safe.mainTextColor,
    '--oc-muted-text': safe.mutedTextColor,
    '--oc-border-color': rgba(accentGlow, safe.beginnerMode ? 0.36 : 0.24),
    '--oc-border-strong': rgba(accentGlow, safe.beginnerMode ? 0.52 : 0.34),
    '--oc-glow': rgba(accentGlow, safe.backgroundColor === '#f7f7fb' ? 0.18 : 0.34),
    '--oc-primary-text': pickReadableText(safe.primaryButtonColor),
    '--oc-secondary-text': pickReadableText(safe.secondaryButtonColor),
    '--oc-bg-image': safe.backgroundImage ? `url("${safe.backgroundImage}")` : 'none',
    '--oc-bg-image-opacity': String(safe.backgroundImage ? safe.backgroundOpacity / 100 : 0),
    '--oc-bg-blur': `${safe.backgroundBlur}px`,
    '--oc-bg-overlay-opacity': safe.backgroundDarkOverlay && safe.backgroundImage ? '0.42' : '0',
    '--oc-font': FONT_STACKS[safe.fontStyle],
    '--oc-font-scale': totalScale.toFixed(3),
    '--oc-heading-scale': safe.beginnerMode ? '1.08' : '1',
    '--oc-btn-min-height': safe.beginnerMode ? '56px' : '48px',
    '--oc-btn-padding-y': safe.beginnerMode ? '14px' : '12px',
    '--oc-btn-padding-x': safe.beginnerMode ? '16px' : '14px',
    '--oc-tab-padding-y': safe.beginnerMode ? '10px' : '8px',
    '--oc-tab-padding-x': safe.beginnerMode ? '14px' : '12px',
    '--bg': safe.backgroundColor,
    '--text': safe.mainTextColor,
    '--muted': safe.mutedTextColor,
    '--card': safe.panelColor,
    '--card-soft': cardSoft,
    '--border': rgba(accentGlow, safe.beginnerMode ? 0.34 : 0.2),
    '--accent': safe.primaryButtonColor,
    '--accent-2': accent2,
    '--danger': '#ef4444',
    '--success': '#22c55e',
    '--warning': '#f59e0b',
    '--shadow': `0 18px 48px ${rgba(safe.backgroundColor, safe.backgroundColor === '#f7f7fb' ? 0.16 : 0.48)}`,
    '--radius': safe.beginnerMode ? '20px' : '18px',
    '--radius-lg': safe.beginnerMode ? '24px' : '20px',
    '--surface-blur': safe.beginnerMode ? '6px' : '10px',
    '--bg-gradient': `linear-gradient(180deg, ${mixHex(safe.backgroundColor, '#ffffff', safe.backgroundColor === '#f7f7fb' ? 0.02 : 0.06)} 0%, ${safe.backgroundColor} 48%, ${mixHex(safe.backgroundColor, '#000000', safe.backgroundColor === '#f7f7fb' ? 0.08 : 0.1)} 100%)`,
    '--field-bg': fieldBg,
    '--field-text': safe.mainTextColor,
    '--field-border': rgba(accentGlow, safe.beginnerMode ? 0.3 : 0.22),
    '--field-placeholder': safe.mutedTextColor,
    '--note-bg': noteBg,
    '--note-text': safe.mainTextColor,
    '--note-border': rgba(accentGlow, safe.beginnerMode ? 0.28 : 0.2),
    '--seed-bg': seedBg,
    '--seed-text': safe.mainTextColor,
    '--seed-border': rgba(accentGlow, 0.22),
    '--warn': '#f59e0b',
    '--oc-hero-bg': `linear-gradient(135deg, ${rgba(heroStart, safe.backgroundColor === '#f7f7fb' ? 0.18 : 0.28)}, ${rgba(heroEnd, safe.backgroundColor === '#f7f7fb' ? 0.14 : 0.24)})`,
    '--oc-elevated-bg': `linear-gradient(135deg, ${rgba(safe.panelColor, 0.98)}, ${rgba(cardSoft, 0.94)})`,
    '--oc-panel-edge': panelEdge,
    '--oc-card-glass': rgba('#ffffff', safe.backgroundColor === '#f7f7fb' ? 0.72 : 0.05),
  }
}

export function applyWalletStyle(style: WalletStyle) {
  try {
    const root = document.documentElement
    const safe = sanitizeWalletStyle(style)
    const variables = createWalletStyleCssVariables(safe)
    root.setAttribute('data-wallet-style-template', safe.templateId)
    for (const [key, value] of Object.entries(variables)) {
      root.style.setProperty(key, value)
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', safe.backgroundColor)
    return safe
  } catch {
    return DEFAULT_WALLET_STYLE
  }
}

export function applyStoredWalletStyle() {
  return applyWalletStyle(getStoredWalletStyle())
}

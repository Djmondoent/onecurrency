export type Theme = 'dark' | 'light' | 'blue'

const THEME_KEY = 'onecurrency.theme'

export function getStoredTheme(): Theme {
  const v = (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY)) || ''
  if (v === 'light' || v === 'blue') return v
  return 'dark'
}

export function initTheme(): Theme {
  const t = getStoredTheme()
  applyTheme(t)
  return t
}

export function setStoredTheme(t: Theme) {
  try { localStorage.setItem(THEME_KEY, t) } catch {}
}

export function applyTheme(t: Theme) {
  try {
    const root = document.documentElement
    root.classList.remove('theme-dark', 'theme-light', 'theme-blue')
    const cls = t === 'light' ? 'theme-light' : t === 'blue' ? 'theme-blue' : 'theme-dark'
    root.classList.add(cls)
    // Reflect in meta theme-color for mobile UI polish
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      const color = t === 'light' ? '#f3f6fb' : t === 'blue' ? '#0b1330' : '#0f172a'
      meta.setAttribute('content', color)
    }
  } catch {}
}

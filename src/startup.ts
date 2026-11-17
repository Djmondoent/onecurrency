let startupTimer: ReturnType<typeof setTimeout> | undefined

export function showStartupError(error: unknown) {
  clearTimeout(startupTimer)
  console.error('OneCurrency could not start:', error)
  const loader = document.getElementById('app-loader')
  if (!loader) return
  loader.style.display = ''
  loader.setAttribute('role', 'alert')
  const root = document.getElementById('root')
  if (root) root.hidden = true
  const title = loader.querySelector('.brand')
  if (title) title.textContent = 'Unable to start OneCurrency'
  const message = loader.querySelector('.muted')
  if (message) message.textContent = 'Check your connection and reload. If this continues, update your browser.'
  const spinner = loader.querySelector<HTMLElement>('.spinner')
  if (spinner) spinner.style.display = 'none'
  if (!document.getElementById('app-retry')) {
    const retry = document.createElement('button')
    retry.id = 'app-retry'
    retry.type = 'button'
    retry.textContent = 'Reload OneCurrency'
    retry.addEventListener('click', () => window.location.reload())
    ;(loader.querySelector('.card') || loader).appendChild(retry)
  }
}

export function startStartupTimer() {
  startupTimer = setTimeout(() => showStartupError(new Error('Startup timed out')), 20000)
}

export function markAppMounted() {
  clearTimeout(startupTimer)
  const loader = document.getElementById('app-loader')
  if (loader) loader.style.display = 'none'
  const root = document.getElementById('root')
  if (root) root.hidden = false
}

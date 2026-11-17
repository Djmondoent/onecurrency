import './polyfills'
import { showStartupError, startStartupTimer } from './startup'

if (
  window.location.protocol === 'http:' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1' &&
  window.location.hostname !== '[::1]'
) {
  window.location.replace(window.location.href.replace('http:', 'https:'))
} else {
  startStartupTimer()
  // A separate entry lets us report download, parse and initialization failures.
  Promise.resolve().then(() => import('./bootstrapApp')).catch(showStartupError)
}

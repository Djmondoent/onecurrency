// Polyfills that MUST run before any other module loads.
// bitcoinjs-lib and friends use the bare Buffer global while
// their modules are evaluated, so this file is imported first by main.tsx.
import { Buffer } from 'buffer'
;(window as any).Buffer = Buffer
;(window as any).global = window
;(window as any).process = { env: {} }

// Vite's dynamic-import preloader uses allSettled, which older WebViews lack.
if (!Promise.allSettled) {
  Promise.allSettled = function <T>(values: Iterable<T | PromiseLike<T>>) {
    return Promise.all(Array.from(values, (value) => Promise.resolve(value).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    )))
  } as typeof Promise.allSettled
}

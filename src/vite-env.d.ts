/// <reference types="vite/client" />

// Allow importing JavaScript assets as URLs (used for bundling A-Frame locally)
declare module '*.js?url' {
  const src: string
  export default src
}

declare module '*.min.js' {
  const anyModule: any
  export default anyModule
}

declare module '*.wav' {
  const src: string
  export default src
}

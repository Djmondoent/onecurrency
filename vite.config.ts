import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standard SPA build using root index.html as entry.
// Emits relative asset paths suitable for Neocities hosting at site root.
export default defineConfig({
  base: './',
  plugins: [react()],
  appType: 'spa',
  esbuild: {
    supported: { bigint: true },
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: true,
  },
})

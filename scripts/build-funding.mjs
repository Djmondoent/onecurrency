import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.mjs'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'build/funding-api.cjs',
  logLevel: 'info',
})

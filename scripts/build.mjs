/**
 * Build the shipped host entry: `lib/index.js` (ESM plugin with the core
 * template logic inlined). The plugin has no browser half — the guide is plain
 * Markdown the shell renders as text.
 */

import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })

await build({
  entryPoints: ['src/host/index.js'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
  minify: false,
  legalComments: 'none',
  external: ['@deepseek-ai/*', 'react', 'react/jsx-runtime'],
})

console.info('built: lib/index.js')

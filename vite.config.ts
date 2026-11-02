import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Make dist/ openable straight from disk (file://) as well as from any static host:
// emit a classic (non-module) script and drop `crossorigin`, which Chrome blocks on file://.
const fileProtocolFriendly = (): Plugin => ({
  name: 'file-protocol-friendly',
  enforce: 'post',
  transformIndexHtml: (html) =>
    html
      .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
      .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" '),
})

// base './' => dist/ works from any sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), fileProtocolFriendly()],
  build: { target: 'es2020', sourcemap: false, modulePreload: false, cssCodeSplit: false, rolldownOptions: { output: { format: 'iife', inlineDynamicImports: true } } },
})

import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { stripLocalSecretBuildOutput } from './src/build/secretOutput.ts'

export default defineConfig({
  plugins: [react(), cloudflare(), stripLocalSecretBuildOutput()],
})

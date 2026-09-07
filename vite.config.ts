import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base se sobrescribe en el workflow de GitHub Pages con VITE_BASE=/<repo>/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
})

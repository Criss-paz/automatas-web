import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * base se sobrescribe en el workflow de GitHub Pages con VITE_BASE=/<repo>/
 * para que las rutas de los assets funcionen bajo un subdirectorio.
 *
 * El target fija hasta donde se transpila. Se eligio deliberadamente bajo
 * (navegadores de ~2019-2020) para que la pagina abra en telefonos y tablets
 * antiguos: si el navegador no entiende una sola linea del bundle, no se
 * muestra nada en absoluto. Ojo: esbuild NO reescribe la sintaxis de las
 * expresiones regulares, asi que en el codigo se evitan lookbehind "(?<=)" y
 * los flags recientes.
 */
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: ['es2019', 'safari13', 'chrome79', 'firefox72', 'edge79'],
    // Un solo archivo JS: menos peticiones y funciona igual servido desde
    // file:// o desde cualquier subcarpeta.
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
})

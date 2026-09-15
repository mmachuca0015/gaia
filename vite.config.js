import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    watch: {
      // El backend vive dentro del root del proyecto, asi que Vite lo vigilaba
      // tambien: cada vez que nodemon reiniciaba, el navegador hacia una
      // recarga completa y se borraba lo que hubiera escrito en un formulario.
      // El backend no forma parte del bundle, no hay nada que recargar por el.
      ignored: ['**/backend/**'],
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { writeFileSync } from 'fs'

// Id único do build — embutido no app (__BUILD_ID__) e escrito em version.json.
// Em runtime o app compara os dois e, se divergirem, recarrega fresco (auto-update).
const BUILD_ID = Date.now().toString()

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    {
      name: 'ff-write-version',
      closeBundle() {
        try {
          writeFileSync(path.resolve(__dirname, 'dist/version.json'), JSON.stringify({ id: BUILD_ID }))
        } catch { /* noop */ }
      },
    },
  ],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('recharts')) return 'charts'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('zustand')) return 'state'
          if (id.includes('react-dom') || id.includes('react-router')) return 'vendor'
        },
      },
    },
  },
})

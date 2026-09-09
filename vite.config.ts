import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vitest is left on its defaults on purpose: it already picks up *.test.ts and
// nothing else, and importing `vitest/config` here drags in a second copy of
// vite whose plugin types disagree with this one's.
export default defineConfig({
  // Asset URLs are baked in at build time, so this has to match the path the
  // game is served from. Local development stays at the root.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    // The game talks to /api in every environment; in production that is
    // nginx in front of the shared scores container. In development, run
    // https://github.com/Coffey-Labs/games-scores alongside this -- or do not,
    // and the board will say so rather than breaking.
    proxy: {
      '/api': {
        target: process.env.SCORES_TARGET ?? 'http://localhost:5184',
        changeOrigin: true,
      },
    },
  },
})

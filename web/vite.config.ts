import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    // Everything the server owns — tokens, live events, state — is proxied so
    // the browser only ever talks to one origin in dev.
    proxy: {
      '/token': 'http://localhost:8787',
      '/events': 'http://localhost:8787',
      '/state': 'http://localhost:8787',
      '/candidate': 'http://localhost:8787',
      '/scorecard': 'http://localhost:8787',
      '/reset': 'http://localhost:8787',
    },
  },
});

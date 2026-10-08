import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;

// `npm run dev:prod-admin` (mode "prod-admin") points the dev frontend at the production admin
// port tunnelled with `fly proxy 3002`, so you can debug the UI against real server data.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(process.env.ACRONOTE_VERSION || rootVersion) },
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: true,
    proxy: { '/api': { target: mode === 'prod-admin' ? 'http://127.0.0.1:3002' : 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  preview: { host: '127.0.0.1', port: 4173 },
}));

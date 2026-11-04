import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Re-use the backend's locally generated certificate so the whole app is served over HTTPS.
const keyFile = path.resolve(here, '../backend/certs/key.pem');
const certFile = path.resolve(here, '../backend/certs/cert.pem');
const https =
  fs.existsSync(keyFile) && fs.existsSync(certFile)
    ? { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }
    : undefined;
if (!https) {
  console.warn('\n[frontend] No certificate found in backend/certs. Run "npm run gen-cert" in /backend to serve over HTTPS.\n');
}

// The browser only ever talks to this origin; Vite forwards /api/* to the HTTPS backend.
// That keeps the CSP simple (connect-src 'self') and avoids browser CORS/certificate prompts for the API.
const API_TARGET = process.env.VITE_API_PROXY_TARGET || 'https://localhost:5443';
const proxy = { '/api': { target: API_TARGET, changeOrigin: true, secure: false, ws: true } };

// ---- Security headers sent with the frontend HTML/JS/CSS ----
const baseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

// Production-grade policy (used by "npm start" / "vite preview" and mirrored by the Part 3 web container):
// scripts, styles, fonts and API calls may only come from our own origin. No inline scripts or styles.
const strictCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

// The dev server needs a little more (inline React-refresh preamble, injected <style>, HMR websocket).
const devCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 0, sourcemap: false }, // no data: URIs for fonts => font-src 'self' is enough
  server: {
    port: 3000,
    strictPort: true,
    https,
    proxy,
    headers: { ...baseHeaders, 'Content-Security-Policy': devCsp },
  },
  preview: {
    port: 3000,
    strictPort: true,
    https,
    proxy,
    headers: { ...baseHeaders, 'Content-Security-Policy': strictCsp },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
});

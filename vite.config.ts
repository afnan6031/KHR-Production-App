import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' => same build works on GitHub Pages (sub-folder), any web host, and inside the Android app.
// v18: SEO — sirf web build (GitHub Pages) mein site ka asli link (canonical) aur Google verification lagta hai.
// Android / Windows build mein VITE_SITE_URL khali hota hai, isliye wahan kuch nahi lagta.
function seoPlugin() {
  return {
    name: 'khr-seo',
    transformIndexHtml(html: string) {
      const url = (process.env.VITE_SITE_URL || '').replace(/\/?$/, '/');
      const ver = process.env.VITE_GOOGLE_VERIFY || '';
      let tags = '';
      if (process.env.VITE_SITE_URL) {
        tags += `<link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n    <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'KHR Production', url, applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Android, Windows', description: 'Video production team manager: channels, scripts, tasks, AI voiceover, performance and daily views.' })}</script>\n    `;
      }
      if (ver) tags += `<meta name="google-site-verification" content="${ver}" />\n    `;
      return html.replace('<!--KHR_SEO-->', tags);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    seoPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'KHR Production',
        short_name: 'KHR Production',
        description: 'Video production team manager: channels, roles, scripts, performance and daily views.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#090C24',
        theme_color: '#090C24',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        // Supabase data hamesha live aaye, cache se nahi
        runtimeCaching: []
      }
    })
  ],
  server: { host: true }
});

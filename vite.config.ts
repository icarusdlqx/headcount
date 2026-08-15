import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any Cloudflare Pages path or preview URL.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1600, // Phaser is ~1.2MB minified; that is expected, not a smell.
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});

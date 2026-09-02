import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,ctb,txt}'],
        // Large on-demand TTS runtimes — fetched only when exporting MP3.
        globIgnores: ['**/ort-*.wasm', '**/espeak-ng-*.wasm'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      manifest: {
        name: 'Graham Braille Editor',
        short_name: 'Braille Editor',
        description: 'Braille Editing & Embossing Suite',
        theme_color: '#2a0a0d',
        background_color: '#2a0a0d',
        display: 'standalone',
      }
    })
  ],

  // Set base to '/' for custom domain deployments.
  // Override via VITE_BASE_URL env var if needed.
  base: process.env.VITE_BASE_URL ?? '/',

  worker: {
    // ES module workers allow static/dynamic imports and fetch()-based loading
    // instead of importScripts(). Required for the WASM-ready braille worker.
    format: 'es',
  },

  optimizeDeps: {
    // Exclude monaco-editor from pre-bundling — it manages its own workers.
    // ONNX / TTS packages are large and load on demand for MP3 export.
    exclude: ['monaco-editor', 'onnxruntime-web', 'kitten-tts-js', 'espeak-ng', 'mammoth'],
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    rollupOptions: {
      output: {
        // Split monaco into its own chunk to keep the main bundle lean.
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
  },
});

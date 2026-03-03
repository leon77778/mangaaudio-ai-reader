import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      esbuild: {
        target: 'esnext'
      },
      optimizeDeps: {
        exclude: ['pdfjs-dist'],
        esbuildOptions: { target: 'esnext' }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          external: ['pdfjs-dist'],
          output: {
            paths: {
              'pdfjs-dist': 'https://esm.sh/pdfjs-dist@4.0.379'
            }
          }
        }
      }
    };
});

import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            build: {
              rollupOptions: {
                // Add the worker as an additional entry point
                input: {
                  main: path.join(__dirname, 'electron/main.ts'),
                  metadataExtractor: path.join(__dirname, 'electron/workers/metadataExtractor.ts'),
                },
                output: {
                  entryFileNames: '[name].js',
                }
              }
            }
          }
        },
        preload: {
          input: path.join(__dirname, 'electron/preload.ts'),
        },
        renderer: process.env.NODE_ENV === 'test'
          ? undefined
          : {},
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        'tty': path.resolve(__dirname, 'src/utils/tty-shim.ts'),
      },
    },
    define: {
      // Only define what's absolutely necessary
      'global': 'globalThis',
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis'
        }
      }
    }
  }
})

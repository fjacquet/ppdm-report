import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // jsdom withholds `localStorage` from opaque origins (e.g. `about:blank`);
    // setting an explicit URL gives the test environment a same-origin
    // window so `window.localStorage` and other origin-bound APIs work.
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    // `virtual:pwa-register/react` only exists when vite-plugin-pwa runs; under
    // vitest it resolves to a benign stub so any test rendering <App/> works.
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwaRegisterStub.ts', import.meta.url),
      ),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/engines/**', 'src/utils/**', 'src/privacy/**'],
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        // browser/worker glue — verified end-to-end, not unit-tested
        'src/engines/parser/parser.worker.ts',
        'src/engines/parser/parseInWorker.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
})

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest config.
 *
 * `environment: 'node'` on purpose. The tests cover `session.ts`, which is pure
 * protocol logic over a socket, and `public/pcm-capture.worklet.js`, whose
 * framing and resampling are pure arithmetic that can be driven with synthetic
 * samples in a `node:vm` sandbox. Node 22 already provides `btoa`/`atob`, so
 * there is no reason to pull in jsdom and the Web Audio stubs that come with it.
 *
 * `audio.ts` and the playback worklet are still untested. Those genuinely need
 * an `AudioContext` and a real output device, and a mock would only assert that
 * the mock works.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Mirrors the `@/*` path alias in tsconfig.json. Without this, an import
      // of `@/lib/ai-client` resolves to nothing and the failure is a confusing
      // "cannot find module" rather than a missing alias.
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});

import { sveltekit } from '@sveltejs/kit/vite';
// `vitest/config`'s `defineConfig` merges Vite's `UserConfig` with Vitest's `test` field — plain
// `vite`'s `defineConfig` doesn't know about `test` and fails typecheck on it.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.{test,spec}.ts'],
  },
});

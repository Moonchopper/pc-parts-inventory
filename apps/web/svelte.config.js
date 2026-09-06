import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * SvelteKit 2 / Svelte 5. `adapter-node` builds a standalone Node server (`build/index.js`) that
 * the harness (`tools/harness/checks/40-web.ts`) and `docker/Dockerfile.web` (W0.6) both run
 * directly — no platform-specific adapter, per D2/D13.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
  },
};

export default config;

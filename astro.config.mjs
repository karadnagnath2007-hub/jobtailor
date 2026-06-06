import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://jobtailor.pages.dev',
  output: 'server',
  adapter: cloudflare(),
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  integrations: [react()],
});

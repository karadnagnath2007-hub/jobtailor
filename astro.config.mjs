import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  site: 'https://jobtailor.vercel.app',
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
});

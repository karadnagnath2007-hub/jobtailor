import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel/serverless';

// Use Node adapter locally, Vercel adapter in production
const adapter = process.env.VERCEL
  ? vercel()
  : node({ mode: 'standalone' });

export default defineConfig({
  site: 'https://jobtailor.vercel.app',
  output: 'server',
  adapter: adapter,
  integrations: [react()],
});

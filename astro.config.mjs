import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages: if deploying to https://<user>.github.io/<repo>/ set base: '/<repo>/'
  // For user/organization pages (https://<user>.github.io/) use base: '/'
  site: 'https://yourname.github.io',
  base: '/',
  integrations: [tailwind()],
});

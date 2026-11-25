// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://bargo.pierre-mouilleseaux-lhuillier.fr',
  vite: {
    plugins: [tailwindcss()]
  },
  output: 'server',
  // Cloudflare Workers. Images : servies telles quelles depuis /_astro/ (service perso) ;
  // l'endpoint /_image faisait un fetch vers le domaine public (erreur 526 en prod).
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'custom',
  }),
  image: {
    service: { entrypoint: './src/lib/image-service.js' },
  },
  env: {
    schema: {
      // URL de PocketBase, lue au build. Jamais de préfixe PUBLIC_.
      PB_URL: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
        default: 'https://pbbargo.pierre-mouilleseaux-lhuillier.fr',
      }),
    },
  },
  security: {
    checkOrigin: false,
  },
});
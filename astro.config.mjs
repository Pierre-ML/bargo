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
  // Cloudflare Workers. Images : optimisées au build pour les pages prérendues ;
  // sur les pages SSR, /_image renvoie l'original (pas de sharp sur Workers).
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile',
  }),
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
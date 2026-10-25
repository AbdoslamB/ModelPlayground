// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import { defineConfig } from 'astro/config';
import { readdirSync, readFileSync } from 'node:fs';

const base = '/ModelPlayground';

/** Model folders whose meta.ts has this status. */
function modelsWithStatus(/** @type {string} */ status) {
  return readdirSync('src/models', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .filter((entry) =>
      new RegExp(`status:\\s*'${status}'`).test(
        readFileSync(`src/models/${entry.name}/meta.ts`, 'utf8'),
      ),
    )
    .map((entry) => entry.name);
}

// Coming soon pages are thin placeholders: keep them out of the sitemap.
const comingSoon = modelsWithStatus('coming-soon').map(
  (slug) => `${base}/models/${slug}/`,
);

/**
 * Gives every ready model's Page.astro its own route. A page then loads only
 * its own model's CSS and scripts; one shared [slug] route would load every
 * model's CSS on every page. Coming soon pages stay on [slug].astro.
 */
const modelPages = {
  name: 'model-pages',
  hooks: {
    /** @param {{ injectRoute: (route: { pattern: string, entrypoint: string }) => void }} options */
    'astro:config:setup': ({ injectRoute }) => {
      for (const slug of modelsWithStatus('ready')) {
        injectRoute({
          pattern: `/models/${slug}`,
          entrypoint: `./src/models/${slug}/Page.astro`,
        });
      }
    },
  },
};

/** Adds the component gallery at /dev/ui/ in `astro dev` only. */
const devGallery = {
  name: 'dev-gallery',
  hooks: {
    /** @param {{ command: string, injectRoute: (route: { pattern: string, entrypoint: string }) => void }} options */
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') {
        injectRoute({ pattern: '/dev/ui', entrypoint: './src/dev/ui.astro' });
      }
    },
  },
};

export default defineConfig({
  site: 'https://abdoslamb.github.io',
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [
    svelte(),
    mdx(),
    sitemap({
      filter: (page) => !comingSoon.some((path) => page.endsWith(path)),
    }),
    modelPages,
    devGallery,
  ],
});

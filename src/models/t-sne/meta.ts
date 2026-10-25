import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 't-sne',
  title: 't-SNE',
  category: 'Dimensionality reduction',
  order: 9,
  status: 'ready',
  summary: 'Draw a map where similar items end up close together.',
} satisfies ModelMeta;

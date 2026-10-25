import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'k-means',
  title: 'k-Means',
  category: 'Clustering',
  order: 3,
  status: 'ready',
  summary: 'Find groups on your own, by moving centres until they settle.',
} satisfies ModelMeta;

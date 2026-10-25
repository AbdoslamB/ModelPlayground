import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'k-nearest-neighbors',
  title: 'k-Nearest Neighbors',
  category: 'Classification',
  order: 2,
  status: 'ready',
  summary: 'Label something new by letting its nearest neighbours vote.',
} satisfies ModelMeta;

import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'support-vector-machine',
  title: 'Support Vector Machine',
  category: 'Classification',
  order: 7,
  status: 'ready',
  summary: 'Find the widest street that separates two classes.',
} satisfies ModelMeta;

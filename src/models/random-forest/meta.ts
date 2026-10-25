import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'random-forest',
  title: 'Random Forest',
  category: 'Classification',
  order: 6,
  status: 'ready',
  summary: 'Let many small trees vote for a steadier answer.',
} satisfies ModelMeta;

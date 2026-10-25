import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'decision-tree',
  title: 'Decision Tree',
  category: 'Classification',
  order: 5,
  status: 'ready',
  summary: 'Split the data with simple yes-or-no questions.',
} satisfies ModelMeta;

import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'linear-regression',
  title: 'Linear Regression',
  category: 'Regression',
  order: 1,
  status: 'ready',
  summary: 'Draw the straight line that best predicts one number from another.',
} satisfies ModelMeta;

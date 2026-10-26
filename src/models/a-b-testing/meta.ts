import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'a-b-testing',
  title: 'A/B Testing',
  category: 'Experiments',
  order: 12,
  status: 'ready',
  summary:
    'Run a fair test of a new search ranking, and decide whether to ship it.',
} satisfies ModelMeta;

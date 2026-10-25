import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'naive-bayes',
  title: 'Naive Bayes',
  category: 'Classification',
  order: 4,
  status: 'ready',
  summary:
    'Weigh the evidence of each word to decide whether a message is spam.',
} satisfies ModelMeta;

import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'recurrent-neural-network',
  title: 'Recurrent Neural Network',
  category: 'Sequence models',
  order: 10,
  status: 'ready',
  summary: 'Read a sequence one step at a time, carrying a memory forward.',
} satisfies ModelMeta;

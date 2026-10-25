import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'q-learning',
  title: 'Q-Learning',
  category: 'Reinforcement learning',
  order: 8,
  status: 'ready',
  summary: 'Learn the best move in each square of a grid from rewards alone.',
} satisfies ModelMeta;

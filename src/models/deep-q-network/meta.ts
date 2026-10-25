import type { ModelMeta } from '../types'; // type-only: erased at build

export const meta = {
  slug: 'deep-q-network',
  title: 'Deep Q-Network',
  category: 'Reinforcement learning',
  order: 11,
  status: 'ready',
  summary: 'Use a small neural network to estimate the value of every move.',
} satisfies ModelMeta;

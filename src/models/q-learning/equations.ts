import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'update',
    tex: "Q(s, a) \\leftarrow Q(s, a) + \\htmlClass{sym-a}{\\alpha} \\big[\\, r + \\htmlClass{sym-b}{\\gamma} \\max_{a'} Q(s', a') - Q(s, a) \\,\\big]",
    words:
      'After each move, the value of that move is nudged towards the reward plus the best value of the next square.',
  },
  {
    id: 'value',
    tex: 'Q(s, a) = \\text{the reward for } a + \\htmlClass{sym-b}{\\gamma} \\times \\text{the best value from the next square}',
    words: 'What a move is worth once learning has settled.',
  },
] satisfies EquationSpec[];

import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'vote',
    tex: '\\hat{y} = \\text{the most common answer of } h_1(q), \\dots, h_{\\htmlClass{sym-line}{T}}(q)',
    words:
      'The forest’s answer for a new seed q: each of the T trees answers, and the most common answer wins.',
  },
  {
    id: 'bootstrap',
    tex: '\\text{sample}_t = n \\text{ draws from the } n \\text{ seeds, with repeats}',
    words:
      'Each tree learns from its own sample: n draws with replacement, so some seeds come twice and others not at all.',
  },
  {
    id: 'unseen',
    tex: 'P(\\text{a seed is never drawn}) = \\left(1 - \\tfrac{1}{n}\\right)^{n} \\approx 37\\%',
    words:
      'With n draws, each seed has about a 37% chance of being left out of a tree’s sample.',
  },
] satisfies EquationSpec[];

import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'assign',
    tex: 'c_i = \\text{the nearest stand to person } i',
    words: 'Every person walks to the stand closest to them.',
  },
  {
    id: 'update',
    tex: '\\mu_j = \\text{the average position of the people at stand } j',
    words: 'Every stand moves to the middle of the people who came to it.',
  },
  {
    id: 'objective',
    tex: '\\htmlClass{sym-error}{J} = \\sum_{i=1}^{n} \\lVert x_i - \\mu_{c_i} \\rVert^2',
    words:
      'J adds up every walk, each one squared. Each step of k-Means makes J smaller, until it cannot shrink any more.',
  },
] satisfies EquationSpec[];

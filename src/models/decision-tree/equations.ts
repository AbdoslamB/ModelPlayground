import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'gini',
    tex: '\\htmlClass{sym-line}{G} = 1 - \\sum_{k} p_k^{\\,2}',
    words:
      'Gini impurity: 1 minus the sum of each kind’s share, squared. 0 means every day in the node is the same kind.',
  },
  {
    id: 'gain',
    tex: '\\text{gain} = \\htmlClass{sym-line}{G}_{\\text{node}} - \\left( \\tfrac{n_{\\text{yes}}}{n}\\, \\htmlClass{sym-line}{G}_{\\text{yes}} + \\tfrac{n_{\\text{no}}}{n}\\, \\htmlClass{sym-line}{G}_{\\text{no}} \\right)',
    words:
      'How much a question lowers the impurity: the node’s G minus the G of its two halves, each weighted by its share of the days.',
  },
] satisfies EquationSpec[];

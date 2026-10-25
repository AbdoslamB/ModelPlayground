import type { EquationSpec } from '../types';

/**
 * Formulas rendered by KaTeX at build time. Symbols get their role colors
 * through \htmlClass (sym-a, sym-b, sym-line, sym-error).
 */
export const equations = [
  {
    id: 'model',
    tex: '\\htmlClass{sym-line}{\\hat{y}} = \\htmlClass{sym-a}{a} + \\htmlClass{sym-b}{b}\\,x',
    words:
      'The prediction starts at a and rises by b for every extra unit of x.',
  },
  {
    id: 'miss',
    tex: '\\htmlClass{sym-error}{e} = y - \\htmlClass{sym-line}{\\hat{y}}',
    words:
      'The miss for one point: how far the real value is from the prediction.',
  },
  {
    id: 'mse',
    tex: '\\text{MSE} = \\frac{1}{n}\\sum_{i=1}^{n} \\htmlClass{sym-error}{e_i}^{2}',
    words:
      'Square every miss so that misses above and below cannot cancel out, then take the average.',
  },
  {
    id: 'best',
    tex: '\\htmlClass{sym-b}{b} = \\frac{\\sum_i (x_i - \\bar{x})(y_i - \\bar{y})}{\\sum_i (x_i - \\bar{x})^2}, \\qquad \\htmlClass{sym-a}{a} = \\bar{y} - \\htmlClass{sym-b}{b}\\,\\bar{x}',
    words:
      'The best slope compares how x and y move together with how much x moves on its own. The best line always passes through the average point.',
  },
] satisfies EquationSpec[];

export type EquationId = (typeof equations)[number]['id'];

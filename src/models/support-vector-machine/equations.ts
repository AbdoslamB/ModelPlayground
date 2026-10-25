import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'linear',
    tex: '\\htmlClass{sym-line}{f}(x) = w \\cdot x + b',
    words:
      'A straight border: f is a weighted sum of the hours, plus b. Above 0 means pass, below 0 means fail.',
  },
  {
    id: 'rbf',
    tex: '\\htmlClass{sym-line}{f}(x) = \\sum_{i} \\alpha_i\\, y_i\\, e^{-\\htmlClass{sym-b}{\\gamma} \\lVert x_i - x \\rVert^2} + b',
    words:
      'A curved border: each support vector pulls f towards its own side, more strongly the closer x is to it.',
  },
  {
    id: 'margin',
    tex: '\\text{margin} = \\frac{2}{\\lVert w \\rVert}',
    words: 'The width of the street between the two dashed lines.',
  },
  {
    id: 'objective',
    tex: '\\min_{w,\\,b}\\; \\tfrac{1}{2}\\lVert w \\rVert^2 + \\htmlClass{sym-a}{C} \\sum_i \\htmlClass{sym-error}{\\xi_i}, \\quad \\htmlClass{sym-error}{\\xi_i} = \\max\\big(0,\\; 1 - y_i \\htmlClass{sym-line}{f}(x_i)\\big)',
    words:
      'The SVM keeps the margin wide (small ‖w‖) while paying C for every bit of slack ξ.',
  },
] satisfies EquationSpec[];

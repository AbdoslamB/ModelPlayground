import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'distance',
    tex: '\\htmlClass{sym-line}{d} = \\sqrt{(x - q_x)^2 + (y - q_y)^2}',
    words:
      'The distance from the new fruit q to a known fruit: the straight line between them, using width and height.',
  },
  {
    id: 'vote',
    tex: '\\hat{y} = \\text{the most common kind among the } \\htmlClass{sym-line}{k} \\text{ nearest fruits}',
    words: 'The prediction is a vote of the k nearest fruits.',
  },
] satisfies EquationSpec[];

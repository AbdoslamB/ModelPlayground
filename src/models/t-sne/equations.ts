import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'cost',
    tex: '\\mathrm{KL}(P \\,\\|\\, Q) = \\sum_{i \\ne j} p_{ij} \\log \\frac{p_{ij}}{q_{ij}}',
    words:
      'The cost t-SNE makes smaller: how badly the closeness on the map (q) matches the closeness in the pictures (p).',
  },
  {
    id: 'p',
    tex: 'p_{j \\mid i} = \\frac{e^{-\\lVert x_i - x_j \\rVert^2 / 2\\sigma_i^2}}{\\sum_{k \\ne i} e^{-\\lVert x_i - x_k \\rVert^2 / 2\\sigma_i^2}}, \\qquad p_{ij} = \\frac{p_{j \\mid i} + p_{i \\mid j}}{2n}',
    words:
      'How likely picture i is to pick j as a neighbour, judged by pixels: a bell curve of width σᵢ, chosen to match the perplexity.',
  },
  {
    id: 'q',
    tex: 'q_{ij} = \\frac{(1 + \\lVert y_i - y_j \\rVert^2)^{-1}}{\\sum_{k \\ne l} (1 + \\lVert y_k - y_l \\rVert^2)^{-1}}',
    words:
      'The same closeness on the map, with a curve that has longer tails, so far-apart groups can spread out.',
  },
] satisfies EquationSpec[];

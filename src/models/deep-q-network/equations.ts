import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'loss',
    tex: "L = \\big(\\, \\underbrace{r + \\gamma \\max_{a'} Q_{\\text{target}}(s', a')}_{\\htmlClass{sym-line}{y}} - Q(s, a) \\,\\big)^2",
    words:
      'The network is nudged so that its value for a move gets closer to the target y: the reward plus the best value of the next square.',
  },
  {
    id: 'network',
    tex: 'Q(s, \\cdot) = W_2\\, \\mathrm{ReLU}(W_1 x_s + b_1) + b_2',
    words:
      'A small neural network turns a square’s position into four Q-values, one per move.',
  },
] satisfies EquationSpec[];

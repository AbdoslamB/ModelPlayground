import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'step',
    tex: 'h_t = \\tanh\\!\\big(W_x\\, x_t + W_h\\, h_{t-1} + b\\big), \\qquad P(\\text{next}) = \\operatorname{softmax}\\!\\big(z_t / \\htmlClass{sym-line}{T}\\big), \\quad z_t = W_y\\, h_t + c',
    words:
      'Each step mixes the new character with the memory so far, then turns the memory into a chance for every possible next character.',
  },
  {
    id: 'softmax',
    tex: 'P(k) = \\frac{e^{z_k / \\htmlClass{sym-line}{T}}}{\\sum_j e^{z_j / \\htmlClass{sym-line}{T}}}',
    words:
      'Scores become chances that add up to 1; the temperature T sharpens or flattens them.',
  },
  {
    id: 'surprise',
    tex: '\\text{surprise} = -\\log_2 P(\\text{the character that really came next})',
    words:
      'How surprised the network was, in bits: 0 for a sure guess, 1 for a coin toss.',
  },
] satisfies EquationSpec[];

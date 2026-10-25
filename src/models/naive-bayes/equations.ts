import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'odds',
    tex: '\\htmlClass{sym-line}{L} = \\log\\frac{P(\\text{spam})}{P(\\text{normal})} + \\sum_{w} \\log\\frac{P(w \\mid \\text{spam})}{P(w \\mid \\text{normal})}',
    words:
      'The total evidence L: where we start before reading, plus what each word in the message adds.',
  },
  {
    id: 'chance',
    tex: 'P(\\text{spam} \\mid \\text{message}) = \\frac{1}{1 + e^{-\\htmlClass{sym-line}{L}}}',
    words: 'The total evidence turned into a chance between 0% and 100%.',
  },
  {
    id: 'word',
    tex: 'P(w \\mid \\text{spam}) = \\frac{\\text{count of } w \\text{ in spam} + \\htmlClass{sym-a}{\\alpha}}{\\text{all words in spam} + \\htmlClass{sym-a}{\\alpha} \\times V}',
    words:
      'How likely a spam message is to use the word w, with smoothing α. V is the number of different words seen in training.',
  },
] satisfies EquationSpec[];

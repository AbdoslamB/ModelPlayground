import type { EquationSpec } from '../types';

/** Formulas rendered by KaTeX at build time. */
export const equations = [
  {
    id: 'z',
    tex: 'z = \\frac{\\htmlClass{sym-line}{\\bar{x}_T - \\bar{x}_C}}{\\sqrt{s_T^2 / n_T + s_C^2 / n_C}}',
    words: 'How many standard errors apart the two groups’ average spend is.',
  },
  {
    id: 'ci',
    tex: '\\htmlClass{sym-line}{\\bar{x}_T - \\bar{x}_C} \\pm z_{1-\\htmlClass{sym-error}{\\alpha}/2} \\cdot \\mathrm{SE}',
    words: 'The interval that holds the true difference in 95% of tests.',
  },
  {
    id: 'n',
    tex: 'n = \\frac{2\\,(z_{1-\\htmlClass{sym-error}{\\alpha}/2} + z_{\\htmlClass{sym-b}{1-\\beta}})^2\\, \\sigma^2}{\\htmlClass{sym-a}{\\delta}^2}',
    words: 'Users needed per group to spot a lift of δ with the chosen power.',
  },
  {
    id: 'split',
    tex: '\\chi^2 = \\sum \\frac{(O - E)^2}{E}',
    words:
      'How far the users counted in each group are from an even 50/50 split.',
  },
  {
    id: 'hypotheses',
    tex: 'H_0\\colon \\mu_T - \\mu_C = 0 \\qquad H_1\\colon \\mu_T - \\mu_C \\neq 0',
    words: 'No difference, against some difference in either direction.',
  },
] satisfies EquationSpec[];

import katex from 'katex';

/**
 * Renders TeX to HTML + MathML at build time, so no math JavaScript ships.
 * Only \htmlClass is trusted: it gives symbols their role colors (sym-a, …).
 */
export function renderTex(tex: string): string {
  return katex.renderToString(tex, {
    output: 'htmlAndMathml',
    throwOnError: true,
    trust: (context) => context.command === '\\htmlClass',
    strict: (code: string) => (code === 'htmlExtension' ? 'ignore' : 'error'),
  });
}

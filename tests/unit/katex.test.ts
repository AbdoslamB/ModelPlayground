import { describe, expect, it } from 'vitest';

import { renderTex } from '../../src/lib/katex';
import { equations } from '../../src/models/linear-regression/equations';

describe('renderTex', () => {
  it.each(equations)('renders the $id equation without errors', ({ tex }) => {
    const html = renderTex(tex);
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
    expect(html).toContain('<math');
  });

  it('keeps role classes on symbols', () => {
    const html = renderTex('\\htmlClass{sym-a}{a}');
    expect(html).toContain('class="enclosing sym-a"');
  });
});

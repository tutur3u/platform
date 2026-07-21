import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FormsMarkdown } from './forms-markdown';

describe('FormsMarkdown', () => {
  it('sanitizes rich HTML during server rendering without crashing', () => {
    const html = renderToString(
      <FormsMarkdown
        content={
          '<p>Hello <strong>friend</strong></p><script>alert(1)</script><a href="javascript:alert(2)">bad link</a>'
        }
      />
    );

    expect(html).toContain('Hello');
    expect(html).toContain('<strong>friend</strong>');
    expect(html).toContain('bad link');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });
});

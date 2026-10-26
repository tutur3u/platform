// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The Worker SSR/RSC runtime has no DOM: DOMPurify resolves to an instance
// without `sanitize`, and isomorphic-dompurify's browser entry throws at import.
vi.mock('isomorphic-dompurify', () => {
  throw new Error('DOM-only sanitizer loaded in a DOM-less runtime');
});
vi.mock('dompurify', () => {
  throw new Error('DOM-only sanitizer loaded in a DOM-less runtime');
});

import { FormsMarkdown } from './forms-markdown';
import { sanitizeFormsRichTextHtml } from './rich-text-html';

describe('FormsMarkdown in a DOM-less runtime', () => {
  it('server-renders sanitized rich HTML without a DOM', () => {
    expect(typeof globalThis.document).toBe('undefined');

    const html = renderToString(
      <FormsMarkdown content='<h1>Title</h1><p>Hi <strong>there</strong></p><img src="x" onerror="alert(1)"><script>alert(2)</script>' />
    );

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>there</strong>');
    expect(html).toContain('<img src="x" />');
    expect(html).not.toMatch(/onerror|<script|alert\(2\)/u);
  });

  it('keeps the rich-text allowlist and strips unsafe markup', () => {
    expect(
      sanitizeFormsRichTextHtml(
        [
          '<a href="javascript:alert(1)" target="_blank" rel="noopener">bad</a>',
          '<a href="https://tuturuuu.com" style="color:red">ok</a>',
          '<iframe src="https://evil.test"></iframe>',
          '<div><u>kept text</u></div>',
          '<img src="data:image/png;base64,AAAA" alt="pixel">',
          '<style>body{}</style>',
        ].join('')
      )
    ).toBe(
      [
        '<a target="_blank" rel="noopener">bad</a>',
        '<a href="https://tuturuuu.com">ok</a>',
        '<u>kept text</u>',
        '<img src="data:image/png;base64,AAAA" alt="pixel" />',
      ].join('')
    );
  });
});

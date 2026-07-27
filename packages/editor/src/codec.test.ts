import { describe, expect, it } from 'vitest';
import { extractPlainText, jsonToMarkdown, markdownToJSON } from './codec.js';
import { renderRichTextToHTML } from './render.js';

describe('rich text codecs', () => {
  it('migrates legacy Markdown and renders without a browser', () => {
    const content = markdownToJSON('# Story\n\nA bilingual paragraph.');
    expect(extractPlainText(content)).toContain('bilingual paragraph');
    expect(jsonToMarkdown(content)).toContain('# Story');
    expect(renderRichTextToHTML(content)).toContain('<h1>Story</h1>');
  });

  it('escapes untrusted text in server rendering', () => {
    expect(
      renderRichTextToHTML(markdownToJSON('<script>x</script>'))
    ).not.toContain('<script>');
  });

  it('rejects unsafe link and image URL schemes during server rendering', () => {
    const content = {
      content: [
        {
          content: [
            {
              marks: [{ attrs: { href: 'javascript:alert(1)' }, type: 'link' }],
              text: 'Unsafe link',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
        {
          attrs: {
            alt: 'Unsafe image',
            src: 'data:text/html,<script>x</script>',
          },
          type: 'image',
        },
      ],
      type: 'doc',
    };

    const html = renderRichTextToHTML(content);
    expect(html).toBe('<p>Unsafe link</p>');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:');
  });
});

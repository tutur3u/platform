import { describe, expect, it } from 'vitest';
import { jsonToMarkdown, markdownToJSON } from './codec.js';

function parseTimed(markdown: string) {
  const startedAt = performance.now();
  const content = markdownToJSON(markdown);
  return { content, elapsed: performance.now() - startedAt };
}

describe('rich text Markdown parsing stays linear', () => {
  it.each([
    ['image destination', `![a](${String.raw`\(`.repeat(40)} `],
    ['image title', `![a](x "${String.raw`\\`.repeat(40)}`],
    ['image alt', `![${String.raw`\\`.repeat(40)}`],
    ['inline link', `see [a](${String.raw`\a`.repeat(40)} "${'\\'.repeat(80)}`],
  ])('%s', (_label, markdown) => {
    expect(parseTimed(markdown).elapsed).toBeLessThan(1000);
  });
});

function linkParagraph(href: string, text = 'Story') {
  return {
    content: [
      {
        content: [
          { marks: [{ attrs: { href }, type: 'link' }], text, type: 'text' },
        ],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

describe('Markdown link destinations escape backslashes', () => {
  it('round-trips a destination ending in a backslash', () => {
    const content = linkParagraph(String.raw`https://example.com/path\\`);
    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('keeps a backslash-paren destination inside the link', () => {
    const href = String.raw`https://example.com/a\)**b**<u>c</u>`;
    const content = linkParagraph(href);
    const markdown = jsonToMarkdown(content);

    expect(markdown).toBe(
      String.raw`[Story](https://example.com/a\\\)**b**<u>c</u>)`
    );
    expect(markdownToJSON(markdown)).toEqual(content);
  });

  it('round-trips image sources containing backslashes', () => {
    const content = {
      content: [
        {
          attrs: { alt: 'Cover', src: String.raw`https://example.com/a\(b\)` },
          type: 'image',
        },
      ],
      type: 'doc',
    };
    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('still parses legacy escaped parentheses in destinations', () => {
    expect(
      markdownToJSON(String.raw`![Cover](https://example.com/a\(1\).png)`)
    ).toEqual({
      content: [
        {
          attrs: { alt: 'Cover', src: 'https://example.com/a(1).png' },
          type: 'image',
        },
      ],
      type: 'doc',
    });
  });
});

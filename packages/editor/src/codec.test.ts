import { describe, expect, it } from 'vitest';
import { extractPlainText, jsonToMarkdown, markdownToJSON } from './codec.js';
import { renderRichTextToHTML, sanitizeRichTextContent } from './render.js';

describe('rich text codecs', () => {
  it('migrates legacy Markdown and renders without a browser', () => {
    const content = markdownToJSON('# Story\n\nA bilingual paragraph.');
    expect(extractPlainText(content)).toContain('bilingual paragraph');
    expect(jsonToMarkdown(content)).toContain('# Story');
    expect(renderRichTextToHTML(content)).toContain('<h1>Story</h1>');
    expect(renderRichTextToHTML(content, { featurePreset: 'full' })).toContain(
      '<h1>Story</h1>'
    );
  });

  it('preserves rich legacy Markdown through structured round trips', () => {
    const markdown = [
      '## Story',
      '',
      '**Bold**, *italic*, ~~struck~~, and [safe link](https://example.com).',
      '',
      '- First',
      '- Second',
      '',
      '1. One',
      '2. Two',
      '',
      '> A useful quote',
      '',
      '---',
      '',
      '![A PNG](https://example.com/cover.png "Cover")',
    ].join('\n');

    const roundTrip = jsonToMarkdown(markdownToJSON(markdown));
    expect(roundTrip).toContain('**Bold**');
    expect(roundTrip).toContain('*italic*');
    expect(roundTrip).toContain('~~struck~~');
    expect(roundTrip).toContain('[safe link](https://example.com)');
    expect(roundTrip).toContain('- First');
    expect(roundTrip).toContain('1. One');
    expect(roundTrip).toContain('> A useful quote');
    expect(roundTrip).toContain('---');
    expect(roundTrip).toContain(
      '![A PNG](https://example.com/cover.png "Cover")'
    );
  });

  it('round-trips and renders collapsible Markdown sections', () => {
    const markdown = [
      '<details>',
      '<summary>Background details</summary>',
      '',
      'A **formatted** secret.',
      '',
      '- First clue',
      '- Second clue',
      '',
      '</details>',
    ].join('\n');
    const content = markdownToJSON(markdown);

    expect(content.content?.[0]?.type).toBe('collapsible');
    expect(jsonToMarkdown(content)).toBe(markdown);
    expect(renderRichTextToHTML(content, { featurePreset: 'full' })).toContain(
      '<details><summary>Background details</summary><p>A <strong>formatted</strong> secret.</p><ul>'
    );
    expect(extractPlainText(content)).toContain('Background details');
  });

  it('round-trips nested collapsibles and multiline summaries', () => {
    const markdown = [
      '<details>',
      '<summary>Outer line  ',
      'continued</summary>',
      '',
      'Before the nested section.',
      '',
      '<details>',
      '<summary>Inner details</summary>',
      '',
      'Nested body.',
      '',
      '</details>',
      '',
      'After the nested section.',
      '',
      '</details>',
    ].join('\n');
    const content = markdownToJSON(markdown);

    expect(content.content?.[0]?.type).toBe('collapsible');
    expect(content.content?.[0]?.content?.[2]?.type).toBe('collapsible');
    expect(jsonToMarkdown(content)).toBe(markdown);
  });

  it('keeps content immediately following a collapsible section', () => {
    const markdown = [
      '<details>',
      '<summary>Notes</summary>',
      '',
      'Hidden context.',
      '',
      '</details>',
      'Visible afterward.',
    ].join('\n');
    const content = markdownToJSON(markdown);

    expect(content.content?.map((node) => node.type)).toEqual([
      'collapsible',
      'paragraph',
    ]);
    expect(extractPlainText(content)).toContain('Visible afterward.');
  });

  it('preserves literal Markdown delimiters through compatibility mirrors', () => {
    const content = {
      content: [
        {
          content: [
            {
              text: String.raw`Literal **stars**, [brackets], _underscores_, ~~tildes~~, and \ slash.`,
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('round-trips combined bold and italic marks', () => {
    const content = {
      content: [
        {
          content: [
            {
              marks: [{ type: 'bold' }, { type: 'italic' }],
              text: 'Emphasized',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('round-trips underline marks without treating literal tags as markup', () => {
    const content = {
      content: [
        {
          content: [
            {
              marks: [{ type: 'underline' }],
              text: 'Underlined',
              type: 'text',
            },
            { text: ' and literal <u>tags</u>', type: 'text' },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('round-trips branded marks and alignment in Markdown mirrors', () => {
    const content = {
      content: [
        {
          attrs: { textAlign: 'center' },
          content: [
            {
              marks: [
                { attrs: { color: 'var(--brand-gold)' }, type: 'textStyle' },
                {
                  attrs: { color: 'var(--brand-highlight)' },
                  type: 'highlight',
                },
              ],
              text: 'Branded',
              type: 'text',
            },
            { type: 'hardBreak' },
            { text: 'Second line', type: 'text' },
          ],
          type: 'paragraph',
        },
        {
          attrs: { level: 3, textAlign: 'right' },
          content: [{ text: 'Aligned heading', type: 'text' }],
          type: 'heading',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('does not collide with literal private-use glyphs', () => {
    const content = {
      content: [
        {
          content: [
            {
              text: '\uE000\uE001\uE00F private glyphs',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it.each(['- literal', '+ literal', '* literal', '1. literal', '2) literal'])(
    'preserves a literal list-like paragraph prefix: %s',
    (text) => {
      const content = {
        content: [
          {
            content: [{ text, type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      };

      expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
    }
  );

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

  it('renders only approved branded styles', () => {
    const content = {
      content: [
        {
          attrs: { textAlign: 'center' },
          content: [
            {
              marks: [
                { attrs: { color: 'var(--brand-gold)' }, type: 'textStyle' },
                {
                  attrs: { color: 'var(--brand-highlight)' },
                  type: 'highlight',
                },
              ],
              text: 'Branded',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };
    const policy = {
      alignments: ['left', 'center', 'right'] as const,
      highlights: [{ label: 'Highlight', value: 'var(--brand-highlight)' }],
      textTones: [{ label: 'Gold', value: 'var(--brand-gold)' }],
    };

    expect(
      renderRichTextToHTML(content, {
        featurePreset: 'full',
        stylePolicy: policy,
      })
    ).toBe(
      '<p style="text-align: center"><mark style="background-color: var(--brand-highlight)"><span style="color: var(--brand-gold)">Branded</span></mark></p>'
    );
    expect(renderRichTextToHTML(content, { featurePreset: 'full' })).toBe(
      '<p>Branded</p>'
    );
  });

  it('sanitizes the exported structured-content contract directly', () => {
    const sanitized = sanitizeRichTextContent(
      {
        content: [
          {
            attrs: { level: 6, textAlign: 'center' },
            content: [
              {
                marks: [
                  { attrs: { href: 'javascript:alert(1)' }, type: 'link' },
                  { type: 'code' },
                ],
                text: 'Safe text',
                type: 'text',
              },
            ],
            type: 'heading',
          },
        ],
        type: 'doc',
      },
      {
        featurePreset: 'full',
        stylePolicy: { alignments: ['center'] },
      }
    );

    expect(sanitized).toEqual({
      content: [
        {
          attrs: { textAlign: 'center' },
          content: [{ marks: [], text: 'Safe text', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    });
  });

  it('preserves safe ordered-list start values in server rendering', () => {
    const content = {
      attrs: { start: 3 },
      content: [
        {
          content: [
            {
              content: [{ text: 'Third', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'listItem',
        },
      ],
      type: 'orderedList',
    };

    expect(
      renderRichTextToHTML(
        { content: [content], type: 'doc' },
        { featurePreset: 'full' }
      )
    ).toBe('<ol start="3"><li><p>Third</p></li></ol>');
  });

  it('flattens full blocks safely for compact rendering', () => {
    const content = markdownToJSON('- One\n- Two');
    const html = renderRichTextToHTML(content, { featurePreset: 'compact' });
    expect(html).toBe('<p>One<br>Two</p>');
    expect(html).not.toContain('<p><p>');
  });

  it('round-trips hard breaks inside a paragraph', () => {
    const content = {
      content: [
        {
          content: [
            { text: 'First', type: 'text' },
            { type: 'hardBreak' },
            { text: 'Second', type: 'text' },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it.each(['bulletList', 'orderedList'] as const)(
    'round-trips hard breaks inside a %s item',
    (type) => {
      const content = {
        content: [
          {
            content: [
              {
                content: [
                  {
                    content: [
                      { text: 'First', type: 'text' },
                      { type: 'hardBreak' },
                      { text: 'Second', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'listItem',
              },
            ],
            type,
          },
        ],
        type: 'doc',
      };

      expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
    }
  );

  it('round-trips nested mixed Markdown lists', () => {
    const content = {
      content: [
        {
          content: [
            {
              content: [
                {
                  content: [{ text: 'Parent', type: 'text' }],
                  type: 'paragraph',
                },
                {
                  content: [
                    {
                      content: [
                        {
                          content: [{ text: 'Child', type: 'text' }],
                          type: 'paragraph',
                        },
                        {
                          attrs: { start: 3 },
                          content: [
                            {
                              content: [
                                {
                                  content: [
                                    { text: 'Grandchild', type: 'text' },
                                  ],
                                  type: 'paragraph',
                                },
                              ],
                              type: 'listItem',
                            },
                          ],
                          type: 'orderedList',
                        },
                      ],
                      type: 'listItem',
                    },
                  ],
                  type: 'bulletList',
                },
              ],
              type: 'listItem',
            },
          ],
          type: 'orderedList',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('round-trips hard breaks and paragraphs inside a quote', () => {
    const content = {
      content: [
        {
          content: [
            {
              content: [
                { text: 'First', type: 'text' },
                { type: 'hardBreak' },
                { text: 'Second', type: 'text' },
              ],
              type: 'paragraph',
            },
            {
              content: [{ text: 'Another paragraph', type: 'text' }],
              type: 'paragraph',
            },
            {
              content: [
                {
                  content: [
                    {
                      content: [{ text: 'Quoted item', type: 'text' }],
                      type: 'paragraph',
                    },
                  ],
                  type: 'listItem',
                },
              ],
              type: 'bulletList',
            },
          ],
          type: 'blockquote',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('round-trips escaped image alt text', () => {
    const content = {
      content: [
        {
          attrs: {
            alt: String.raw`Richfield ] mark \ source`,
            src: 'https://example.com/cover.png',
          },
          type: 'image',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('round-trips escaped link and image titles', () => {
    const content = {
      content: [
        {
          content: [
            {
              marks: [
                {
                  attrs: {
                    href: 'https://example.com/story',
                    title: String.raw`A "quoted" \ title`,
                  },
                  type: 'link',
                },
              ],
              text: 'Story',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
        {
          attrs: {
            alt: 'Cover',
            src: 'https://example.com/cover.png',
            title: String.raw`A "quoted" \ title`,
          },
          type: 'image',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });

  it('round-trips balanced parentheses in link destinations', () => {
    const content = {
      content: [
        {
          content: [
            {
              marks: [
                {
                  attrs: { href: 'https://example.com/a_(b)' },
                  type: 'link',
                },
              ],
              text: 'Link',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    expect(markdownToJSON(jsonToMarkdown(content))).toEqual(content);
  });
});

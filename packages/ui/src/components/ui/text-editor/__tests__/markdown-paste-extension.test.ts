import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeClipboardText } from '../content-migration';
import { getEditorExtensions } from '../extensions';
import { __markdownPastePrivate } from '../markdown-paste-extension';

const {
  markdownToHtml,
  looksLikeMarkdown,
  normalizePastedPlainText,
  shouldConvertPastedText,
} = __markdownPastePrivate;

const editors: Editor[] = [];

function createEditor(content: Record<string, unknown>) {
  const editor = new Editor({ content, extensions: getEditorExtensions() });
  editors.push(editor);
  return editor;
}

function copyDocument(editor: Editor) {
  return serializeClipboardText(
    editor.state.doc.slice(0, editor.state.doc.content.size)
  );
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe('markdownToHtml', () => {
  it('should convert headings', () => {
    const md = '# H1\n## H2\n### H3';
    const html = markdownToHtml(md);
    expect(html).toContain('<h1>');
    expect(html).toContain('<h2>');
    expect(html).toContain('<h3>');
  });

  it('should convert bold and italic', () => {
    const md = '**bold** and *italic*';
    const html = markdownToHtml(md);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('should convert strikethrough and highlight', () => {
    const md = '~~deleted~~ and ==highlighted==';
    const html = markdownToHtml(md);
    expect(html).toContain('<s>deleted</s>');
    expect(html).toContain('<mark>highlighted</mark>');
  });

  it('should convert inline code', () => {
    const md = 'some `code` here';
    const html = markdownToHtml(md);
    expect(html).toContain('<code>code</code>');
  });

  it('should convert code blocks', () => {
    const md = '```ts\nconst x = 1;\n```';
    const html = markdownToHtml(md);
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('const x = 1;');
  });

  it('should convert bullet lists', () => {
    const md = '- item 1\n- item 2';
    const html = markdownToHtml(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><p>item 1</p></li>');
    expect(html).toContain('<li><p>item 2</p></li>');
  });

  it('normalizes copied visual bullets into structured list markers', () => {
    const text = normalizePastedPlainText(
      'Next steps\r\n• Draft the interview plan\r\n◦ Share it with the team'
    );

    expect(text).toBe(
      'Next steps\n- Draft the interview plan\n- Share it with the team'
    );
    expect(looksLikeMarkdown(text)).toBe(true);
    expect(markdownToHtml(text)).toContain(
      '<ul><li><p>Draft the interview plan</p></li><li><p>Share it with the team</p></li></ul>'
    );
  });

  it('normalizes copied visual checkboxes into task list markers', () => {
    const text = normalizePastedPlainText('☐ Plan interviews\n☑ Invite team');

    expect(text).toBe('- [ ] Plan interviews\n- [x] Invite team');
    expect(markdownToHtml(text)).toContain('data-type="taskList"');
  });

  it('collapses pathological blank-line runs without removing section spacing', () => {
    const text = normalizePastedPlainText(
      'First section\r\n\r\n\r\n\r\nSecond section\n\n\n- Item'
    );

    expect(text).toBe('First section\n\nSecond section\n\n- Item');
  });

  it('does not collapse intentional blank lines inside fenced code', () => {
    const text = normalizePastedPlainText(
      'Before\n\n\n```ts\nfirst()\n\n\nsecond()\n```\n\n\nAfter'
    );

    expect(text).toBe('Before\n\n```ts\nfirst()\n\n\nsecond()\n```\n\nAfter');
  });

  it('keeps semantic rich HTML for long structured task descriptions', () => {
    const text = normalizePastedPlainText(
      'KEEPING FROM THE NEW VERSION:\n• The new About Me UI editor: I like the compactness of it more than the older version.'
    );
    const html = [
      '<h1>KEEPING FROM THE NEW VERSION:</h1>',
      '<ul><li><p><strong>The new About Me UI editor:</strong> ',
      'I like the compactness of it more than the older version.</p></li></ul>',
    ].join('');

    expect(looksLikeMarkdown(text)).toBe(true);
    expect(shouldConvertPastedText({ html, text })).toBe(false);
  });

  it('converts Markdown when clipboard HTML is only a visual wrapper', () => {
    const text = '# Heading\n- Item';
    const html = '<div># Heading<br>- Item</div>';

    expect(shouldConvertPastedText({ html, text })).toBe(true);
    expect(shouldConvertPastedText({ html: '', text })).toBe(true);
  });

  it('should convert ordered lists', () => {
    const md = '1. first\n2. second';
    const html = markdownToHtml(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li><p>first</p></li>');
  });

  it('should convert task lists', () => {
    const md = '- [ ] unchecked\n- [x] checked';
    const html = markdownToHtml(md);
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="false"');
    expect(html).toContain('data-checked="true"');
  });

  it('keeps adjacent regular and task lists as separate structures', () => {
    const html = markdownToHtml(
      '- Regular item\n\n- [ ] Pending task\n- [x] Finished task'
    );

    expect(html).toContain('<ul><li><p>Regular item</p></li></ul>');
    expect(html).toContain('<ul data-type="taskList">');
    expect(html).not.toContain('data-checked="null"');
  });

  it('should convert nested unordered lists', () => {
    const md = '- Item A\n  - Nested A1\n  - Nested A2\n- Item B';
    const html = markdownToHtml(md);
    expect(html).toContain('<ul>');
    // Parent item
    expect(html).toContain('<li><p>Item A</p>');
    // Nested list inside parent li
    expect(html).toContain(
      '<ul><li><p>Nested A1</p></li><li><p>Nested A2</p></li></ul>'
    );
    // Next sibling
    expect(html).toContain('<li><p>Item B</p></li>');
  });

  it('should convert nested ordered lists inside bullet lists', () => {
    const md = '- Step Two\n  1. Sub-step\n  2. Sub-step';
    const html = markdownToHtml(md);
    expect(html).toContain('<li><p>Step Two</p>');
    expect(html).toContain(
      '<ol><li><p>Sub-step</p></li><li><p>Sub-step</p></li></ol>'
    );
  });

  it('preserves a copied ordered-list start number', () => {
    const html = markdownToHtml('3. Third\n4. Fourth');

    expect(html).toContain('<ol start="3">');
  });

  it('should convert deeply nested lists', () => {
    const md = '- A\n  - B\n    - C\n      - D';
    const html = markdownToHtml(md);
    // Four levels of nesting
    expect(html.match(/<ul>/g)?.length).toBe(4);
    expect(html).toContain('<li><p>D</p></li>');
  });

  it('should convert task lists with nested regular lists', () => {
    const md = '- [ ] Parent task\n  - Sub item 1\n  - Sub item 2';
    const html = markdownToHtml(md);
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('<div><p>Parent task</p>');
    expect(html).toContain(
      '<ul><li><p>Sub item 1</p></li><li><p>Sub item 2</p></li></ul>'
    );
    expect(html).toContain('</div></li>');
  });

  it('should convert links', () => {
    const md = '[link](https://example.com)';
    const html = markdownToHtml(md);
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it('should strip double-quoted link titles', () => {
    const md = '[OpenAI](https://openai.com "Title here")';
    const html = markdownToHtml(md);
    expect(html).toContain('<a href="https://openai.com">OpenAI</a>');
    expect(html).not.toContain('Title here');
  });

  it('should strip single-quoted link titles', () => {
    const md = "[OpenAI](https://openai.com 'Title here')";
    const html = markdownToHtml(md);
    expect(html).toContain('<a href="https://openai.com">OpenAI</a>');
    expect(html).not.toContain('Title here');
  });

  it('should strip parenthesized link titles', () => {
    const md = '[OpenAI](https://openai.com (Title here))';
    const html = markdownToHtml(md);
    expect(html).toContain('<a href="https://openai.com">OpenAI</a>');
    expect(html).not.toContain('Title here');
  });

  it('should convert autolink URLs', () => {
    const md = '<https://example.com>';
    const html = markdownToHtml(md);
    expect(html).toContain(
      '<a href="https://example.com">https://example.com</a>'
    );
  });

  it('should convert autolink email addresses', () => {
    const md = '<user@example.com>';
    const html = markdownToHtml(md);
    expect(html).toContain(
      '<a href="mailto:user@example.com">user@example.com</a>'
    );
  });

  it('should convert mailto autolinks', () => {
    const md = '<mailto:user@example.com>';
    const html = markdownToHtml(md);
    expect(html).toContain(
      '<a href="mailto:user@example.com">mailto:user@example.com</a>'
    );
  });

  it('should sanitize dangerous autolink URLs', () => {
    const md = '<javascript:alert(1)>';
    const html = markdownToHtml(md);
    expect(html).not.toContain('<a href="javascript:');
    expect(html).toContain('&lt;javascript:alert(1)&gt;');
  });

  it('should convert images', () => {
    const md = '![alt text](https://example.com/img.png)';
    const html = markdownToHtml(md);
    expect(html).toContain(
      '<img src="https://example.com/img.png" alt="alt text" />'
    );
  });

  it('should convert blockquotes', () => {
    const md = '> quote here';
    const html = markdownToHtml(md);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('quote here');
  });

  it('should convert nested blockquotes', () => {
    const md = '> This is a blockquote\n>> Nested quote\n>>> Deep nesting';
    const html = markdownToHtml(md);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<p>This is a blockquote</p>');
    expect(html).toContain('<p>Nested quote</p>');
    expect(html).toContain('<p>Deep nesting</p>');
    // Three levels of nesting = three opening blockquote tags
    expect(html.match(/<blockquote>/g)?.length).toBe(3);
    expect(html.match(/<\/blockquote>/g)?.length).toBe(3);
  });

  it('should convert horizontal rules', () => {
    const md = '---';
    const html = markdownToHtml(md);
    expect(html).toContain('<hr>');
  });

  it('should convert tables', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = markdownToHtml(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th><p>A</p></th>');
    expect(html).toContain('<td><p>1</p></td>');
  });

  it('should convert paragraphs', () => {
    const md = 'Hello world';
    const html = markdownToHtml(md);
    expect(html).toContain('<p>Hello world</p>');
  });

  it('preserves intentional line breaks inside pasted paragraphs', () => {
    const html = markdownToHtml('Line one\nLine two');

    expect(html).toContain('<p>Line one<br>Line two</p>');
  });

  it('should escape HTML in plain text', () => {
    const md = '<script>alert(1)</script>';
    const html = markdownToHtml(md);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('should sanitize dangerous link URLs', () => {
    const md = '[click](javascript:alert(1))';
    const html = markdownToHtml(md);
    expect(html).not.toContain('<a href="javascript:');
    expect(html).toContain('[click](javascript:alert(1))');
  });

  it('should allow safe link URLs', () => {
    const md = '[click](https://example.com)';
    const html = markdownToHtml(md);
    expect(html).toContain('<a href="https://example.com">click</a>');
  });

  it('should sanitize dangerous image URLs', () => {
    const md = '![x](javascript:alert(1))';
    const html = markdownToHtml(md);
    expect(html).not.toContain('<img src="javascript:');
  });

  it('should not mutate inline code with markdown-like syntax', () => {
    const md = '`const x = **1**`';
    const html = markdownToHtml(md);
    expect(html).toContain('<code>const x = **1**</code>');
    expect(html).not.toContain('<strong>');
  });

  it('should preserve subscript HTML tags', () => {
    const md = 'H<sub>2</sub>O';
    const html = markdownToHtml(md);
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<p>H<sub>2</sub>O</p>');
  });

  it('should preserve superscript HTML tags', () => {
    const md = 'x<sup>2</sup>';
    const html = markdownToHtml(md);
    expect(html).toContain('<sup>2</sup>');
    expect(html).toContain('<p>x<sup>2</sup></p>');
  });

  it('should escape non-sub/sup HTML tags', () => {
    const md = '<div>text</div>';
    const html = markdownToHtml(md);
    expect(html).toContain('&lt;div&gt;');
    expect(html).not.toContain('<div>');
  });
});

describe('task-description clipboard serialization', () => {
  it('removes duplicate empty blocks while retaining one section gap', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'KEEPING FROM THE NEW VERSION:' }],
        },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Intro' }],
        },
        { type: 'paragraph' },
        { type: 'paragraph' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Next section' }],
        },
      ],
    });

    expect(copyDocument(editor)).toBe(
      '# KEEPING FROM THE NEW VERSION:\n\nIntro\n\n## Next section'
    );
  });

  it('retains unordered, nested ordered, and task-list markers', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Parent bullet' }],
                },
                {
                  type: 'orderedList',
                  attrs: { start: 3 },
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Nested step' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Pending' }],
                },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Finished' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(copyDocument(editor)).toBe(
      [
        '- Parent bullet',
        '  3. Nested step',
        '',
        '- [ ] Pending',
        '- [x] Finished',
      ].join('\n')
    );
  });

  it('retains headings, inline formatting, links, and hard breaks', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Docs',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'deleted', marks: [{ type: 'strike' }] },
          ],
        },
      ],
    });
    const slice = editor.state.doc.slice(0, editor.state.doc.content.size);
    let fromClipboardProp = '';
    editor.view.someProp('clipboardTextSerializer', (serializer) => {
      fromClipboardProp = serializer(slice, editor.view);
      return true;
    });

    expect(fromClipboardProp).toBe(
      '## **Bold** and *italic*\n\n[Docs](https://example.com)\n~~deleted~~'
    );
  });

  it('round-trips the reported task shape through plain clipboard text', () => {
    const source = createEditor({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'CHANGES FOR THE SITE' }],
        },
        { type: 'paragraph' },
        { type: 'paragraph' },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'The new editor:',
                      marks: [{ type: 'bold' }],
                    },
                    { type: 'text', text: ' keep the compact layout.' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const clipboardText = copyDocument(source);
    const destination = createEditor({ type: 'doc', content: [] });
    destination.commands.setContent(markdownToHtml(clipboardText));
    const content = destination.getJSON().content ?? [];

    expect(clipboardText).toBe(
      '# CHANGES FOR THE SITE\n\n- **The new editor:** keep the compact layout.'
    );
    expect(content.map((node) => node.type).slice(0, 2)).toEqual([
      'heading',
      'bulletList',
    ]);
    expect(content[1]).toMatchObject({
      content: [
        {
          content: [
            {
              content: [
                { marks: [{ type: 'bold' }], text: 'The new editor:' },
                { text: ' keep the compact layout.' },
              ],
            },
          ],
        },
      ],
    });
  });
});

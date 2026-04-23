import { describe, expect, it } from 'vitest';
import { __markdownPastePrivate } from '../markdown-paste-extension';

const { markdownToHtml } = __markdownPastePrivate;

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
});

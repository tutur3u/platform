import { describe, expect, it } from 'vitest';
import { __markdownPastePrivate } from '../markdown-paste-extension';

const { markdownToHtml } = __markdownPastePrivate;

function timed(markdown: string) {
  const startedAt = performance.now();
  const html = markdownToHtml(markdown);
  return { elapsed: performance.now() - startedAt, html };
}

describe('markdown paste parsing stays linear on adversarial lines', () => {
  it.each([
    ['list item', `-${' '.repeat(100_000)}x\r`],
    ['task item', `- [ ]${' '.repeat(100_000)}x\r`],
    ['code fence', `\`\`\`${' '.repeat(100_000)}-`],
    ['heading', `#${' '.repeat(100_000)}x\r`],
  ])('%s', (_label, markdown) => {
    expect(timed(markdown).elapsed).toBeLessThan(1000);
  });
});

describe('markdown paste parsing always makes progress', () => {
  it('renders a list-like line the item parser rejects as a paragraph', () => {
    const { elapsed, html } = timed('- first\u2028second');
    expect(elapsed).toBeLessThan(1000);
    expect(html).toContain('first');
    expect(html).toContain('second');
  });
});

describe('markdown paste parsing keeps legitimate output', () => {
  it('parses headings, ignoring extra spaces after the marker', () => {
    expect(markdownToHtml('##   Title')).toBe('<h2>Title</h2>');
    expect(markdownToHtml('# Title')).toBe('<h1>Title</h1>');
  });

  it('parses fenced code with trailing whitespace after the language', () => {
    expect(markdownToHtml('```ts  \nconst a = 1;\n```')).toContain(
      '<pre><code class="language-ts">const a = 1;</code></pre>'
    );
  });

  it('parses list and task items including empty ones', () => {
    const html = markdownToHtml('- [x]   done\n- [ ] todo');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('done');
    expect(html).toContain('todo');
    expect(markdownToHtml('-  item')).toContain('item');
  });
});

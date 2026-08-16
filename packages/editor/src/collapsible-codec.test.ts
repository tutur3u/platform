import { describe, expect, it } from 'vitest';
import { extractPlainText, jsonToMarkdown, markdownToJSON } from './codec.js';

describe('collapsible codec edge cases', () => {
  it('keeps image Markdown literal inside inline-only summaries', () => {
    const markdown = [
      '<details>',
      '<summary>![cover](https://example.com/a.png)</summary>',
      '',
      'Hidden context.',
      '',
      '</details>',
    ].join('\n');
    const content = markdownToJSON(markdown);
    const summaryNode = content.content?.[0]?.content?.[0];

    expect(summaryNode?.type).toBe('collapsibleSummary');
    expect(summaryNode?.content).toEqual([
      {
        text: '![cover](https://example.com/a.png)',
        type: 'text',
      },
    ]);
    expect(jsonToMarkdown(content)).toContain(
      '<summary>!\\[cover\\](https://example.com/a.png)</summary>'
    );
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
});

import { describe, expect, it } from 'vitest';
import { __markdownPastePrivate } from '../markdown-paste-extension';

const { markdownToHtml } = __markdownPastePrivate;

function elapsed(run: () => void) {
  const startedAt = performance.now();
  run();
  return performance.now() - startedAt;
}

describe('markdownToHtml regular expressions', () => {
  it('keeps list, task, code fence and heading output unchanged', () => {
    const cases: Array<[string, string]> = [
      [
        '- one\n- two\n  - nested',
        '<ul><li><p>one</p></li><li><p>two</p><ul><li><p>nested</p></li></ul></li></ul>',
      ],
      ['* \titem', '<ul><li><p>item</p></li></ul>'],
      ['-    ', '<ul><li><p></p></li></ul>'],
      [
        '- [ ] todo\n- [X]   spaced',
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p>todo</p></div></li><li data-type="taskItem" data-checked="true"><div><p>spaced</p></div></li></ul>',
      ],
      [
        '- [ ]\t',
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p></p></div></li></ul>',
      ],
      [
        '  ```  python  \ncode\n```',
        '<pre><code class="language-python">code</code></pre>',
      ],
      ['```\nplain\n```', '<pre><code>plain</code></pre>'],
      ['###\t\tSpaced  title', '<h3>Spaced  title</h3>'],
      ['## \t ', '<h2> </h2>'],
      ['####### seven', '<p>####### seven</p>'],
    ];

    for (const [markdown, html] of cases)
      expect(markdownToHtml(markdown)).toBe(html);
  });

  it('does not stall on a list marker line containing a carriage return', () => {
    expect(markdownToHtml('- a\rb')).toBe('<p>- a\rb</p>');
  });

  it('handles long whitespace runs in linear time', () => {
    const run = '\t'.repeat(100_000);
    const documents = [
      `*\t${run}\ra\r`,
      `- [ ]\t${run}`,
      `\`\`\`${run}!`,
      `#${run}\ra\r`,
      `#${run}\r`,
    ];

    for (const markdown of documents)
      expect(elapsed(() => markdownToHtml(markdown))).toBeLessThan(200);
  });
});

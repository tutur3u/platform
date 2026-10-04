import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';
import { parseEditorMarkdown, serializeEditorMarkdown } from '../markdown';

const editors: Editor[] = [];
function editor(markdown: string) {
  const value = new Editor({
    extensions: getEditorExtensions(),
    content: parseEditorMarkdown(markdown),
  });
  editors.push(value);
  return value;
}
afterEach(() => {
  for (const value of editors.splice(0)) value.destroy();
});
describe('Full document Markdown editing', () => {
  it('round-trips headings, bold, links, code, and lists through the editor schema', () => {
    const source =
      '# Synthetic chapter\n\n**A hero** meets [a friend](https://example.test).\n\n- First scene\n- Second scene\n\n```ts\nconst year = -10;\n```';
    const first = editor(source);
    const markdown = serializeEditorMarkdown(first);
    const second = editor(markdown);
    expect(second.getJSON()).toEqual(first.getJSON());
    expect(markdown).toContain('**A hero**');
    expect(markdown).toContain('https://example.test');
    expect(markdown).toContain('const year = -10;');
  });
  it('preserves tables, task states, and artwork through source editing', () => {
    const first = editor(
      '| Name | Role |\n| --- | --- |\n| Hero | Guide |\n\n- [x] Cross the river\n- [ ] Return home\n\n![Synthetic artwork](https://example.test/art.png)'
    );
    const second = editor(serializeEditorMarkdown(first));
    const json = second.getJSON();
    expect(JSON.stringify(json)).toContain('table');
    expect(JSON.stringify(json)).toContain('"checked":true');
    expect(JSON.stringify(json)).toContain('"checked":false');
    expect(JSON.stringify(json)).toContain('https://example.test/art.png');
    expect(second.getText()).toContain('Guide');
  });
  it('keeps executable HTML and unsafe links out of the actual editor document', () => {
    const value = editor(
      '<script>alert(1)</script>\n\n[Unsafe](javascript:alert)'
    );
    const html = value.getHTML();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
});

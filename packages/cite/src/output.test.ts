import { describe, expect, it } from 'vitest';
import {
  parseFormattedHtml,
  toHtml,
  toMarkdown,
  toPlainText,
  toQuillDelta,
  toTiptapNodes,
} from './output';

describe('safe citation output serializers', () => {
  it('preserves rich meaning and strips executable markup', () => {
    const output = parseFormattedHtml(
      '<div><i>Synthetic &amp; safe</i> <b>text</b><script>hidden()</script><style>body{}</style><img src=x onerror=bad()><a href="javascript:bad()">link</a></div>'
    );
    expect(toPlainText(output)).toBe('Synthetic & safe textlink');
    expect(toHtml(output)).toBe(
      '<em>Synthetic &amp; safe</em> <strong>text</strong>link'
    );
    expect(toHtml(output)).not.toMatch(/script|onerror|javascript:/);
    expect(toMarkdown(output)).toBe('*Synthetic & safe* **text**link');
  });
  it('escapes supplied run text and refuses unsafe run links at every serializer', () => {
    const output = {
      runs: [
        {
          text: '<img onerror="bad()">',
          href: 'javascript:bad()',
          italic: true as const,
        },
      ],
    };
    expect(toHtml(output)).toBe(
      '<em>&lt;img onerror=&quot;bad()&quot;&gt;</em>'
    );
    expect(toTiptapNodes(output)[0]).toEqual({
      type: 'text',
      text: '<img onerror="bad()">',
      marks: [{ type: 'italic' }],
    });
    expect(toQuillDelta(output).ops[0]?.attributes).toEqual({ italic: true });
    expect(toMarkdown(output)).not.toContain('javascript:');
  });
  it('preserves links and vertical marks as structured editor data', () => {
    const output = parseFormattedHtml(
      '<a href="https://example.org/source"><sup>2</sup></a>'
    );
    expect(toTiptapNodes(output)).toEqual([
      {
        type: 'text',
        text: '2',
        marks: [
          { type: 'superscript' },
          { type: 'link', attrs: { href: 'https://example.org/source' } },
        ],
      },
    ]);
    expect(toQuillDelta(output).ops[0]?.attributes).toEqual({
      script: 'super',
      link: 'https://example.org/source',
    });
    expect(toPlainText(parseFormattedHtml(toHtml(output)))).toBe('2');
  });
  it('rejects unbounded generated output', () => {
    expect(() => parseFormattedHtml('x'.repeat(1_000_001))).toThrow(RangeError);
    expect(() => parseFormattedHtml('<i>a</i>b'.repeat(5001))).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { jsonToMarkdown, markdownToJSON } from './codec.js';
import {
  BLOCK_IMAGE_PATTERN,
  INLINE_IMAGE_PATTERN,
  INLINE_LINK_PATTERN,
} from './markdown-link-syntax.js';

// The previous patterns backtrack exponentially; keep them only as a parity
// oracle on short inputs.
const LEGACY_INLINE_IMAGE =
  /!\[([^\]]*)\]\(((?:\\[()]|[^)\s])+)(?:\s+"((?:\\.|[^"])*)")?\)/u;
const LEGACY_INLINE_LINK =
  /\[([^\]]+)\]\(((?:\\[()]|[^)\s])+)(?:\s+"((?:\\.|[^"])*)")?\)/u;
const LEGACY_BLOCK_IMAGE =
  /^!\[((?:\\.|[^\]])*)\]\(((?:\\[()]|[^)\s])+)(?:\s+"((?:\\.|[^"])*)")?\)$/u;

const PAIRS = [
  [LEGACY_INLINE_IMAGE, INLINE_IMAGE_PATTERN],
  [LEGACY_INLINE_LINK, INLINE_LINK_PATTERN],
  [LEGACY_BLOCK_IMAGE, BLOCK_IMAGE_PATTERN],
] as const;

const PREFIXES = ['', '![', '[', '![](', '[a](', '![a](x "', '[a](x\\'];
const ALPHABET = ['\\', '\\', '\\', '(', ')', ')', '"', '"', '[', ']', '!'];
ALPHABET.push('a', ' ', '\n');

function snapshot(match: RegExpExecArray | null) {
  return match ? [match.index, ...match] : null;
}

function elapsed(run: () => void) {
  const startedAt = performance.now();
  run();
  return performance.now() - startedAt;
}

describe('markdown link syntax', () => {
  it('matches the legacy patterns on known examples', () => {
    const examples = [
      '![A PNG](https://example.com/cover.png "Cover")',
      '[safe link](https://example.com)',
      '[Link](https://example.com/a_\\(b\\))',
      '[Story](https://example.com "A \\"quoted\\" \\\\ title")',
      '![Richfield \\] mark \\\\ source](https://example.com/cover.png)',
      '[a](x\\) trailing',
      '[a](x "t\\\\") ")',
      '[a](x "t\\")',
      '![a](x "\\\\\\"")',
      '![a\\\\](x)',
      '![a\\](x)](y)',
    ];

    for (const example of examples)
      for (const [legacy, current] of PAIRS)
        expect(snapshot(current.exec(example))).toEqual(
          snapshot(legacy.exec(example))
        );
  });

  it('matches the legacy patterns on generated inputs', () => {
    let seed = 12_345;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T>(values: readonly T[]) =>
      values[Math.floor(random() * values.length)] as T;

    for (let iteration = 0; iteration < 20_000; iteration += 1) {
      let input = pick(PREFIXES);
      const length = Math.floor(random() * 14);
      for (let index = 0; index < length; index += 1) input += pick(ALPHABET);

      for (const [legacy, current] of PAIRS)
        expect(snapshot(current.exec(input))).toEqual(
          snapshot(legacy.exec(input))
        );
    }
  });

  it('rejects pathological link and image input in linear time', () => {
    const repeat = 50_000;
    const cases: Array<[RegExp, string]> = [
      [INLINE_IMAGE_PATTERN, `![](${'\\('.repeat(repeat)} `],
      [INLINE_IMAGE_PATTERN, `![](!\t"${'\\!'.repeat(repeat)}`],
      [INLINE_LINK_PATTERN, `[\\](${'\\('.repeat(repeat)} `],
      [INLINE_LINK_PATTERN, `[\\](!\t"${'\\!'.repeat(repeat)}`],
      [BLOCK_IMAGE_PATTERN, `![${'\\\\'.repeat(repeat)}`],
      [BLOCK_IMAGE_PATTERN, `![](${'\\('.repeat(repeat)} `],
      [BLOCK_IMAGE_PATTERN, `![](!\t"${'\\!'.repeat(repeat)}`],
    ];

    for (const [pattern, input] of cases)
      expect(elapsed(() => pattern.exec(input))).toBeLessThan(200);
  });

  it('parses pathological markdown documents in linear time', () => {
    const repeat = 50_000;
    const documents = [
      `![](!\t"${'\\a'.repeat(repeat)}`,
      `[x](!\t"${'\\a'.repeat(repeat)}`,
      `![${'\\\\'.repeat(repeat)}`,
    ];

    for (const markdown of documents)
      expect(elapsed(() => markdownToJSON(markdown))).toBeLessThan(500);
  });

  it('round-trips backslashes in link and image destinations', () => {
    const content = {
      content: [
        {
          content: [
            {
              marks: [
                {
                  attrs: { href: 'https://example.com/a\\*b\\' },
                  type: 'link',
                },
              ],
              text: 'Link',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
        {
          attrs: { alt: 'Cover', src: 'https://example.com/c\\)over.png\\' },
          type: 'image',
        },
      ],
      type: 'doc',
    };

    const markdown = jsonToMarkdown(content);
    expect(markdown).toContain('(https://example.com/a\\\\*b\\\\)');
    expect(markdownToJSON(markdown)).toEqual(content);
  });
});

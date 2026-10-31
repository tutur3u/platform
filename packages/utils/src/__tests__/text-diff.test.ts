import { describe, expect, it } from 'vitest';
import {
  computeLineDiff,
  computeWordDiff,
  type DiffChange,
  formatDiffForDisplay,
  getDiffStats,
  hasDiffChanges,
} from '../text-diff';

describe('computeLineDiff', () => {
  it.each<[string, string, string, DiffChange[]]>([
    [
      'identical text',
      'a\nb\n',
      'a\nb\n',
      [{ type: 'unchanged', value: 'a\nb\n' }],
    ],
    [
      'an added line',
      'a\n',
      'a\nb\n',
      [
        { type: 'unchanged', value: 'a\n' },
        { type: 'added', value: 'b\n' },
      ],
    ],
    [
      'a removed line',
      'a\nb\n',
      'a\n',
      [
        { type: 'unchanged', value: 'a\n' },
        { type: 'removed', value: 'b\n' },
      ],
    ],
    [
      'a replaced line',
      'a\nb\nc\n',
      'a\nx\nc\n',
      [
        { type: 'unchanged', value: 'a\n' },
        { type: 'removed', value: 'b\n' },
        { type: 'added', value: 'x\n' },
        { type: 'unchanged', value: 'c\n' },
      ],
    ],
    [
      'an empty to non-empty text',
      '',
      'a\n',
      [{ type: 'added', value: 'a\n' }],
    ],
    [
      'a non-empty to empty text',
      'a\n',
      '',
      [{ type: 'removed', value: 'a\n' }],
    ],
    ['two empty texts', '', '', []],
  ])('diffs %s', (_label, oldText, newText, expected) => {
    expect(computeLineDiff(oldText, newText)).toEqual(expected);
  });
});

describe('computeWordDiff', () => {
  it('marks only the changed word', () => {
    const changes = computeWordDiff('the quick fox', 'the slow fox');
    expect(changes.filter((c) => c.type === 'removed')).toEqual([
      { type: 'removed', value: 'quick' },
    ]);
    expect(changes.filter((c) => c.type === 'added')).toEqual([
      { type: 'added', value: 'slow' },
    ]);
    expect(changes.map((c) => c.value).join('')).toContain('the ');
  });

  it('reports no changes for identical text', () => {
    expect(computeWordDiff('same words', 'same words')).toEqual([
      { type: 'unchanged', value: 'same words' },
    ]);
  });

  it('reports pure additions when the old text is empty', () => {
    expect(computeWordDiff('', 'new text')).toEqual([
      { type: 'added', value: 'new text' },
    ]);
  });
});

describe('getDiffStats', () => {
  it.each<[string, DiffChange[], ReturnType<typeof getDiffStats>]>([
    ['an empty diff', [], { added: 0, removed: 0, unchanged: 0 }],
    [
      'multi-line chunks',
      [
        { type: 'unchanged', value: 'a\nb\n' },
        { type: 'added', value: 'c\nd\ne\n' },
        { type: 'removed', value: 'f\n' },
      ],
      { added: 3, removed: 1, unchanged: 2 },
    ],
    [
      'blank lines being ignored',
      [{ type: 'added', value: '\n\nx\n\n' }],
      { added: 1, removed: 0, unchanged: 0 },
    ],
    [
      'chunks without a trailing newline',
      [
        { type: 'removed', value: 'a' },
        { type: 'removed', value: 'b\nc' },
      ],
      { added: 0, removed: 3, unchanged: 0 },
    ],
  ])('counts %s', (_label, diff, expected) => {
    expect(getDiffStats(diff)).toEqual(expected);
  });
});

describe('hasDiffChanges', () => {
  it.each<[string, DiffChange[], boolean]>([
    ['an empty diff', [], false],
    ['only unchanged chunks', [{ type: 'unchanged', value: 'a' }], false],
    [
      'an added chunk',
      [
        { type: 'unchanged', value: 'a' },
        { type: 'added', value: 'b' },
      ],
      true,
    ],
    ['a removed chunk', [{ type: 'removed', value: 'a' }], true],
  ])('returns the right answer for %s', (_label, diff, expected) => {
    expect(hasDiffChanges(diff)).toBe(expected);
  });
});

describe('formatDiffForDisplay', () => {
  it.each<[string, DiffChange[], string]>([
    ['an empty diff', [], ''],
    [
      'prefixes by change type',
      [
        { type: 'unchanged', value: 'keep\n' },
        { type: 'removed', value: 'old\n' },
        { type: 'added', value: 'new\n' },
      ],
      '  keep\n- old\n+ new',
    ],
    [
      'prefixes every line of a multi-line chunk',
      [{ type: 'added', value: 'one\ntwo\n' }],
      '+ one\n+ two',
    ],
    [
      'dropping blank lines inside a chunk',
      [{ type: 'unchanged', value: 'a\n\nb\n' }],
      '  a\n  b',
    ],
  ])('formats %s', (_label, diff, expected) => {
    expect(formatDiffForDisplay(diff)).toBe(expected);
  });

  it('round-trips a real line diff', () => {
    const diff = computeLineDiff('a\nb\n', 'a\nc\n');
    expect(formatDiffForDisplay(diff)).toBe('  a\n- b\n+ c');
    expect(getDiffStats(diff)).toEqual({ added: 1, removed: 1, unchanged: 1 });
    expect(hasDiffChanges(diff)).toBe(true);
  });
});

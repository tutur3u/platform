import { expect, it } from 'vitest';
import {
  formatMeetSourceAnswer,
  selectMeetSources,
} from './chat-source-footer';

it('retains a bounded source window with consistent duplicate IDs and citation numbers', () => {
  const sources = Array.from({ length: 12 }, (_, index) => ({
    sourceType: 'url' as const,
    id: `ref${index}`,
    url: `https://example.com/${index}`,
    title: 'A'.repeat(1000),
  }));
  const selected = selectMeetSources([
    ...sources,
    { ...sources[0]!, id: 'duplicate' },
  ]);
  expect(new Set(selected.map((source) => source.url)).size).toBe(8);
  expect(selected.at(-1)?.id).toBe('duplicate');
  const answer = formatMeetSourceAnswer(
    'First [ref0], eighth [ref7], same [duplicate].',
    selected
  );
  expect(answer).toContain('[1](<https://example.com/0>)');
  expect(answer).toContain('[8](<https://example.com/7>)');
  expect(answer).not.toContain('https://example.com/8');
});
it('reserves complete source links within the persisted message limit', () => {
  const sources = Array.from({ length: 8 }, (_, index) => ({
    sourceType: 'url' as const,
    id: `ref${index}`,
    url: `https://example.com/${index}/${'a'.repeat(2000)}`,
    title: 'A'.repeat(1000),
  }));
  const answer = formatMeetSourceAnswer(
    `A complete paragraph.\n\n${'long paragraph '.repeat(2000)}`,
    sources
  );
  expect(answer.length).toBeLessThanOrEqual(16000);
  expect(answer).toMatch(/^A complete paragraph\.\n…\n\n- \[/);
  expect(answer).toMatch(/>\)$/);
  expect(selectMeetSources(sources)).toHaveLength(1);
});

it('keeps a readable escaped prefix when the first paragraph alone is oversized', () => {
  const answer = formatMeetSourceAnswer(
    'Useful explanation with **formatting** and [links](https://example.com). '.repeat(
      1000
    ),
    [{ sourceType: 'url', id: 'ref', url: 'https://example.com' }]
  );
  expect(answer.length).toBeLessThanOrEqual(16000);
  expect(answer).toContain('Useful explanation with');
  expect(answer.length).toBeGreaterThan(1000);
  expect(answer).toMatch(/\n…\n\n- \[example\.com\]/);
});

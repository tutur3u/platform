import { expect, it } from 'vitest';
import { resolveMeetCitations } from './chat-citations';

it('resolves exact provider IDs to stable numbered links without guessing unknown references', () => {
  const sources = [
    {
      id: 'Qwc9DWuSIxrr9kI6',
      sourceType: 'url' as const,
      url: 'https://rmitnct.club/',
    },
    { id: 'another', sourceType: 'url' as const, url: 'https://rmitnct.club/' },
  ];
  expect(
    resolveMeetCitations(
      'Club [Qwc9DWuSIxrr9kI6]. Again [another]. Unknown [unmapped].',
      sources
    )
  ).toBe(
    'Club [1](<https://rmitnct.club/>). Again [1](<https://rmitnct.club/>). Unknown [unmapped].'
  );
});
it('preserves code and rejects unsafe source URLs', () => {
  const sources = [
    { id: 'ref', sourceType: 'url' as const, url: 'javascript:alert(1)' },
  ];
  expect(resolveMeetCitations('[ref]', sources)).toBe('[ref]');
  expect(
    resolveMeetCitations('`[ref]`\n```\n[ref]\n```', [
      { ...sources[0]!, url: 'https://example.com' },
    ])
  ).toBe('`[ref]`\n```\n[ref]\n```');
});

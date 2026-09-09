import { expect, it } from 'vitest';
import {
  remarkUnresolvedCitations,
  splitChatSources,
  UNRESOLVED_CITATION,
} from './chat-sources';

it('extracts the existing server source footer and deduplicates URLs', () => {
  expect(
    splitChatSources(
      'Answer.\n\n- [RMIT](<https://rmit.edu.vn/>)\n- [Same](<https://rmit.edu.vn/>)'
    )
  ).toEqual({
    text: 'Answer.',
    sources: [{ title: 'Same', url: 'https://rmit.edu.vn/' }],
  });
});
it('leaves ordinary lists, unsafe links, and code examples untouched', () => {
  for (const body of [
    'A list\n- [Example](<https://example.com/>)',
    '- [Example](<https://example.com/>)',
    'Answer\n\n- [Unsafe](<javascript:alert(1)>)',
    '```\n\n- [Example](<https://example.com/>)',
    '~~~ts\n\n- [Example](<https://example.com/>)',
  ])
    expect(splitChatSources(body)).toEqual({ text: body, sources: [] });
});
it('turns unresolved legacy reference IDs into a readable unavailable marker without editing code', () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'text', value: 'Claim [Qwc9DWuSIxrr9kI6]. [a regular quote]' },
      { type: 'inlineCode', value: '[Qwc9DWuSIxrr9kI6]' },
    ],
  };
  remarkUnresolvedCitations()(tree);
  expect(tree.children).toContainEqual({
    type: 'link',
    url: UNRESOLVED_CITATION,
    children: [{ type: 'text', value: '?' }],
  });
  expect(tree.children).toContainEqual({
    type: 'inlineCode',
    value: '[Qwc9DWuSIxrr9kI6]',
  });
  expect(tree.children.at(-2)).toEqual({
    type: 'text',
    value: '. [a regular quote]',
  });
});

it('preserves the original validated URL for exact citation matching', () => {
  expect(
    splitChatSources('Answer\n\n- [Example](<https://example.com>)').sources[0]
      ?.url
  ).toBe('https://example.com');
});

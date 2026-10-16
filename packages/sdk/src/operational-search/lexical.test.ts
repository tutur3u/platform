import { expect, it } from 'vitest';
import { lexicalSearch, type SearchDocument, tokenize } from './lexical';

function document(id: string, text: string): SearchDocument {
  return {
    id,
    canonicalId: id,
    contributingIds: [id],
    title: id,
    text,
    contentHash: 'a'.repeat(64),
    provenance: [
      {
        itemId: id,
        source: 'synthetic:test',
        firstEventSeq: 1,
        lastEventSeq: 1,
        events: [],
      },
    ],
  };
}

it('retrieves Vietnamese with accents, unaccented input, and code identifiers', () => {
  const documents = [
    document(
      'calendar-rsvp',
      'Sửa lỗi lịch hẹn và xác nhận tham dự. saveReceipt staleSession'
    ),
    document('storage-cleanup', 'Reclaim inactive build cache'),
  ];
  expect(
    lexicalSearch(documents, 'lịch hẹn').map((result) => result.id)
  ).toEqual(['calendar-rsvp']);
  expect(
    lexicalSearch(documents, 'lich hen').map((result) => result.id)
  ).toEqual(['calendar-rsvp']);
  expect(lexicalSearch(documents, 'stale session')[0]?.id).toBe(
    'calendar-rsvp'
  );
  expect(tokenize('saveReceipt source_database_id')).toEqual([
    'save',
    'receipt',
    'source',
    'database',
    'id',
  ]);
});

it('keeps distinct acceptance criteria as separate uncertain results', () => {
  const documents = [
    document('calendar-ui', 'Calendar RSVP display status'),
    document('calendar-write', 'Calendar RSVP persist status offline'),
  ];
  expect(
    lexicalSearch(documents, 'calendar RSVP')
      .map((result) => result.id)
      .sort()
  ).toEqual(['calendar-ui', 'calendar-write']);
  expect(lexicalSearch(documents, 'no-matching-term')).toEqual([]);
  expect(lexicalSearch(documents, 'calendar-write')[0]?.id).toBe(
    'calendar-write'
  );
});

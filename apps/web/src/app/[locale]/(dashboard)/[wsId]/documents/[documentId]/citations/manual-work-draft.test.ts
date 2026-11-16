import { describe, expect, it } from 'vitest';
import {
  emptyManualDraft,
  MANUAL_FIELDS_BY_TYPE,
  manualDraftToWork,
  newContributor,
} from './manual-work-draft';

describe('manual work draft contributor roles', () => {
  it('credits an edited book to its editors by default', () => {
    const draft = emptyManualDraft('edited-book');
    expect(draft.contributors.map((entry) => entry.role)).toEqual(['editor']);

    const result = manualDraftToWork(
      {
        ...draft,
        title: 'Synthetic Essays on Rivers',
        contributors: [
          newContributor('person', {
            role: 'editor',
            family: 'Nguyen',
            given: 'Alex',
          }),
          newContributor('organization', {
            role: 'editor',
            name: 'Example Collective',
          }),
        ],
        year: '2022',
        publisher: 'Synthetic Press',
        publisherPlace: 'Hanoi',
      },
      'manual:edited'
    );
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.work.authors).toEqual([]);
    expect(result.work.editors).toEqual([
      { kind: 'person', family: 'Nguyen', given: 'Alex' },
      { kind: 'organization', name: 'Example Collective' },
    ]);
    expect(result.work.publisherPlace).toBe('Hanoi');
  });

  it('maps chapter authors, book editors and translators to separate arrays', () => {
    expect(MANUAL_FIELDS_BY_TYPE['book-chapter']).toContain('publisherPlace');

    const result = manualDraftToWork(
      {
        ...emptyManualDraft('book-chapter'),
        title: 'A Synthetic Chapter',
        containerTitle: 'Synthetic Essays on Rivers',
        contributors: [
          newContributor('person', { role: 'author', family: 'Tran' }),
          newContributor('person', {
            role: 'editor',
            family: 'Nguyen',
            given: 'Alex',
          }),
          newContributor('person', { role: 'translator', family: 'Le' }),
        ],
        year: '2021',
        pages: '10-24',
        publisher: 'Synthetic Press',
        publisherPlace: 'Da Nang',
      },
      'manual:chapter'
    );
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.work.authors).toEqual([{ kind: 'person', family: 'Tran' }]);
    expect(result.work.editors).toEqual([
      { kind: 'person', family: 'Nguyen', given: 'Alex' },
    ]);
    expect(result.work.translators).toEqual([{ kind: 'person', family: 'Le' }]);
    expect(result.work.publisherPlace).toBe('Da Nang');
  });

  it('drops a hidden publisher place for types that do not offer it', () => {
    const result = manualDraftToWork(
      {
        ...emptyManualDraft('webpage'),
        title: 'Synthetic Page',
        url: 'https://example.com/page',
        publisherPlace: 'Hue',
        noDate: true,
      },
      'manual:web'
    );
    expect(result.kind === 'ready' && result.work.publisherPlace).toBe(
      undefined
    );
  });
});

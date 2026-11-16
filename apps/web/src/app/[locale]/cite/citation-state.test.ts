// @vitest-environment node
import type { CitationLookupResult } from '@tuturuuu/internal-api/cite';
import { describe, expect, it } from 'vitest';
import {
  type CitationDraft,
  draftToFields,
  emptyDraft,
  newAuthor,
  toLookupErrorCode,
} from './citation-draft';
import { computeCitationOutput } from './citation-output';
import {
  type CitationState,
  citationReducer,
  initialCitationState,
} from './citation-state';

const article: CitationLookupResult = {
  fields: {
    type: 'article-journal',
    title: 'Synthetic tides in miniature oceans',
    authors: [{ family: 'Vale', given: 'Mira' }],
    year: 2024,
    containerTitle: 'Journal of Invented Systems',
    volume: '12',
    DOI: '10.5555/synthetic.2024.41',
  },
  source: 'crossref',
  needsReview: true,
};

function draft(overrides: Partial<CitationDraft>): CitationDraft {
  return { ...emptyDraft(), ...overrides };
}

function edit(state: CitationState, title: string) {
  return citationReducer(state, {
    type: 'edit',
    update: (current) => ({ ...current, title }),
  });
}

describe('draftToFields', () => {
  it('requires a title before formatting', () => {
    expect(draftToFields(emptyDraft())).toEqual({ kind: 'incomplete' });
  });

  it('cites only the fields used by the selected source type', () => {
    const result = draftToFields(
      draft({
        type: 'webpage',
        title: 'Imaginary Observatory guide',
        volume: '9',
        URL: 'https://example.org/guide',
      })
    );
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.fields.volume).toBeUndefined();
    expect(result.fields.URL).toBe('https://example.org/guide');
  });

  it('keeps organisations and allows sources without authors', () => {
    const organisation = draftToFields(
      draft({
        title: 'Annual synthetic report',
        authors: [newAuthor('Fictional Institute')],
      })
    );
    expect(
      organisation.kind === 'ready' && organisation.fields.authors
    ).toEqual([{ family: 'Fictional Institute' }]);
    const anonymous = draftToFields(draft({ title: 'Untitled notes' }));
    expect(anonymous.kind === 'ready' && anonymous.fields.authors).toEqual([]);
  });

  it('flags invalid years and authors without a family name', () => {
    expect(
      draftToFields(
        draft({ title: 'X', year: '20x4', authors: [newAuthor('', 'Lea')] })
      )
    ).toEqual({
      kind: 'invalid',
      issues: expect.arrayContaining(['authors', 'year']),
    });
  });

  it('recomputes output for each style and drops output when fields become invalid', () => {
    const fields = draftToFields(
      draft({
        title: 'Synthetic tides',
        authors: [newAuthor('Vale', 'Mira')],
        year: '2024',
      })
    );
    const apa = computeCitationOutput(fields, 'apa');
    const harvard = computeCitationOutput(fields, 'harvard');
    expect(apa.kind).toBe('ready');
    expect(harvard.kind).toBe('ready');
    if (apa.kind === 'ready' && harvard.kind === 'ready')
      expect(apa.inText).not.toBe(harvard.inText);
    expect(
      computeCitationOutput(
        draftToFields(draft({ title: 'X', year: 'abc' })),
        'apa'
      )
    ).toEqual({ kind: 'invalid' });
  });
});

describe('citationReducer', () => {
  it('applies the current lookup and marks it for review', () => {
    let state = citationReducer(initialCitationState(), {
      type: 'lookupStarted',
      requestId: 1,
    });
    state = citationReducer(state, {
      type: 'lookupSucceeded',
      requestId: 1,
      result: article,
    });
    expect(state.lookup).toEqual({ kind: 'review', source: 'crossref' });
    expect(state.draft.title).toBe(article.fields.title);
  });

  it('keeps manual edits made while a lookup was pending', () => {
    let state = citationReducer(initialCitationState(), {
      type: 'lookupStarted',
      requestId: 1,
    });
    state = edit(state, 'My own title');
    state = citationReducer(state, {
      type: 'lookupSucceeded',
      requestId: 1,
      result: article,
    });
    expect(state.draft.title).toBe('My own title');
    expect(state.lookup.kind).toBe('stale');

    state = citationReducer(state, { type: 'applyStale' });
    expect(state.draft.title).toBe(article.fields.title);
  });

  it('ignores results from superseded or cancelled lookups', () => {
    let state = citationReducer(initialCitationState(), {
      type: 'lookupStarted',
      requestId: 1,
    });
    state = citationReducer(state, { type: 'lookupStarted', requestId: 2 });
    const after = citationReducer(state, {
      type: 'lookupSucceeded',
      requestId: 1,
      result: article,
    });
    expect(after).toBe(state);

    const reset = citationReducer(state, { type: 'reset' });
    expect(
      citationReducer(reset, {
        type: 'lookupFailed',
        requestId: 2,
        code: 'TIMEOUT',
      }).lookup
    ).toEqual({ kind: 'idle' });
  });

  it('enters manual completion for unreadable pages', () => {
    let state = citationReducer(initialCitationState(), {
      type: 'lookupStarted',
      requestId: 1,
    });
    state = citationReducer(state, {
      type: 'lookupSucceeded',
      requestId: 1,
      result: {
        fields: {
          type: 'webpage',
          title: '',
          authors: [],
          URL: 'https://example.org/a',
        },
        source: 'manual',
        needsReview: true,
      },
    });
    expect(state.lookup).toEqual({ kind: 'manual' });
    expect(state.draft).toMatchObject({
      type: 'webpage',
      URL: 'https://example.org/a',
    });
  });
});

describe('toLookupErrorCode', () => {
  it('maps API errors to known codes without using server text', () => {
    expect(toLookupErrorCode({ status: 429, message: 'RATE_LIMITED' })).toBe(
      'RATE_LIMITED'
    );
    expect(toLookupErrorCode({ status: 503, message: 'provider said x' })).toBe(
      'LOOKUP_UNAVAILABLE'
    );
    expect(toLookupErrorCode({ status: 404 })).toBe('NOT_FOUND');
    expect(toLookupErrorCode(new TypeError('Failed to fetch'))).toBe(
      'UPSTREAM_ERROR'
    );
  });
});

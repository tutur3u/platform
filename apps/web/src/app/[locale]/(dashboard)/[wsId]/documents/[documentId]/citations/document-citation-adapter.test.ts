import type {
  CitationSnapshot,
  DocumentCitation,
} from '@tuturuuu/ui/text-editor/citation';
import { describe, expect, it } from 'vitest';
import {
  createCitationSnapshot,
  createDocumentCitationAdapter,
  formatDocumentCitations,
  inspectCitationSnapshot,
} from './document-citation-adapter';
import { mapCaptureResponse } from './document-citation-capture';
import {
  parseRepairResponse,
  toCitationFailure,
} from './document-citation-transport';
import {
  emptyManualDraft,
  manualDraftToWork,
  newContributor,
} from './manual-work-draft';

const work = (id: string, title: string, family: string) => ({
  id,
  type: 'book',
  title,
  authors: [{ kind: 'person', family, given: 'Alex' }],
  issued: { year: 2021 },
  publisher: 'Synthetic Press',
});

const snapshotOf = (value: unknown, libraryVersion: number | null = null) => {
  const snapshot = createCitationSnapshot(
    value,
    libraryVersion,
    () => new Date(0)
  );
  if (!snapshot) throw new Error('fixture must be valid');
  return snapshot;
};

const cite = (
  citationId: string,
  snapshot: CitationSnapshot,
  extra: Partial<DocumentCitation> = {}
): DocumentCitation => ({
  citationId,
  itemId: null,
  snapshot,
  locator: null,
  suppressAuthor: false,
  ...extra,
});

describe('document citation adapter', () => {
  it('leaves unsupported snapshot versions uninterpreted for recovery', () => {
    const created = snapshotOf(work('future', 'Synthetic future source', 'Le'));
    if (created.kind !== 'cite-work')
      throw new Error('fixture must use canonical work');
    const future = { ...created, version: 999 };
    expect(inspectCitationSnapshot(future, 'apa').status).toBe('invalid');
    expect(
      formatDocumentCitations('apa', [cite('future-cite', future)]).issues
    ).toEqual([{ citationId: 'future-cite', code: 'invalid-work' }]);
  });
  it('offers explicit title search without forwarding document text automatically', async () => {
    const calls: string[] = [];
    const adapter = createDocumentCitationAdapter({
      capture: async (input) => {
        calls.push(input);
        return { status: 'ok', data: { kind: 'candidates', candidates: [] } };
      },
    });
    expect(calls).toEqual([]);
    await adapter.capture?.searchTitle?.('Synthetic field notes');
    expect(calls).toEqual(['title:Synthetic field notes']);
  });
  it('derives one reference per canonical work from the placed citations', () => {
    const first = snapshotOf(work('a', 'Synthetic Fieldwork', 'Nguyen'));
    const again = snapshotOf(work('b', 'Synthetic Fieldwork', 'Nguyen'));
    const other = snapshotOf(work('c', 'Another Sample', 'Tran'));
    const result = formatDocumentCitations('apa', [
      cite('c1', first),
      cite('c2', again, { locator: { label: 'page', value: '12' } }),
      cite('c3', other, { suppressAuthor: true }),
    ]);

    expect(result.bibliography).toHaveLength(2);
    expect(result.bibliography[0]?.citationIds).toEqual(['c1', 'c2']);
    expect(result.inText.c1).toContain('Nguyen');
    expect(result.inText.c2).toContain('12');
    expect(result.inText.c3).not.toContain('Tran');
    expect(result.issues).toEqual([]);
  });

  it('formats legacy-field snapshots and reports unreadable ones without failing', () => {
    const legacy: CitationSnapshot = {
      kind: 'legacy-fields',
      version: 1,
      fields: {
        type: 'webpage',
        title: 'Legacy Page',
        authors: [{ family: 'Le' }],
        year: 2020,
      },
      capturedAt: '2026-11-16T00:00:00.000Z',
    };
    const broken: CitationSnapshot = {
      kind: 'cite-work',
      version: 1,
      work: { title: 'No type' },
      capturedAt: '2026-11-16T00:00:00.000Z',
      libraryVersion: null,
    };
    const result = formatDocumentCitations('harvard', [
      cite('l', legacy),
      cite('x', broken),
    ]);

    expect(result.inText.l).toContain('Le');
    expect(result.bibliography).toHaveLength(1);
    expect(result.issues).toEqual([{ citationId: 'x', code: 'invalid-work' }]);
    expect(inspectCitationSnapshot(broken, 'apa')).toEqual({
      status: 'invalid',
      summary: { title: 'No type', contributors: '', year: null },
    });
  });

  it('carries italic runs for reference titles alongside plain text', () => {
    const result = formatDocumentCitations('apa', [
      cite('c1', snapshotOf(work('a', 'Synthetic Fieldwork', 'Nguyen'))),
    ]);
    const [entry] = result.bibliography;
    expect(entry?.runs?.map((run) => run.text).join('')).toBe(entry?.text);
    expect(entry?.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          italic: true,
          text: expect.stringContaining('Synthetic Fieldwork'),
        }),
      ])
    );
  });

  it('reports style-required fields without invalidating the snapshot', () => {
    const snapshot = snapshotOf(work('a', 'Synthetic Fieldwork', 'Nguyen'));
    const harvard = inspectCitationSnapshot(snapshot, 'harvard');
    expect(harvard.status).toBe('valid');
    if (harvard.status === 'valid') {
      expect(harvard.issues).toContainEqual({
        field: 'publisherPlace',
        severity: 'error',
      });
    }
    const apa = inspectCitationSnapshot(snapshot, 'apa');
    expect(apa.status === 'valid' && apa.issues).toEqual([]);
  });

  it('only wraps works that pass the canonical schema', () => {
    expect(
      createCitationSnapshot({ title: 'Missing id and type' }, null)
    ).toBeNull();
    expect(snapshotOf(work('a', 'T', 'F'), 4)).toMatchObject({
      kind: 'cite-work',
      libraryVersion: 4,
      capturedAt: '1970-01-01T00:00:00.000Z',
    });
  });
});

describe('capture mapping', () => {
  it('keeps manual results as drafts and never invents a title', () => {
    const fields = {
      type: 'webpage',
      title: '',
      authors: [],
      URL: 'https://example.org/a',
    };
    expect(mapCaptureResponse({ kind: 'manual', fields })).toEqual({
      status: 'ok',
      data: { kind: 'manual', draft: fields },
    });
  });

  it('re-validates candidates and caps them at three', () => {
    const candidates = [1, 2, 3, 4].map((n) =>
      work(`w${n}`, `Title ${n}`, 'Pham')
    );
    const result = mapCaptureResponse({
      kind: 'candidates',
      candidates: [{ bad: true }, ...candidates],
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok' && result.data.kind === 'candidates') {
      expect(
        result.data.candidates.map((entry) => entry.summary.title)
      ).toEqual(['Title 1', 'Title 2']);
    }
  });
});

describe('manual work draft', () => {
  it('is incomplete without a title and ready for a valid organisation-authored report', () => {
    const draft = emptyManualDraft('report');
    expect(manualDraftToWork(draft, 'manual:1')).toEqual({
      kind: 'incomplete',
    });

    const ready = manualDraftToWork(
      {
        ...draft,
        title: 'Annual Synthetic Report',
        contributors: [
          newContributor('organization', { name: 'Example Agency' }),
        ],
        noDate: true,
      },
      'manual:1'
    );
    expect(ready.kind).toBe('ready');
    if (ready.kind === 'ready') {
      expect(ready.work.authors).toEqual([
        { kind: 'organization', name: 'Example Agency' },
      ]);
      expect(ready.work.issued).toEqual({ nd: true });
    }
  });

  it('reports invalid identifiers instead of dropping them', () => {
    const result = manualDraftToWork(
      {
        ...emptyManualDraft('journal-article'),
        title: 'T',
        doi: 'not-a-doi',
        year: '2020',
        month: '13',
      },
      'manual:2'
    );
    expect(result).toMatchObject({ kind: 'invalid' });
    if (result.kind === 'invalid') {
      expect(result.fields).toEqual(expect.arrayContaining(['doi', 'date']));
    }
  });
});

describe('transport mapping', () => {
  it('retains uncertain billing instead of presenting a fresh unavailable request', () => {
    expect(
      toCitationFailure({
        status: 503,
        code: 'AI_UNAVAILABLE',
        billingStatus: 'unknown',
      })
    ).toEqual({
      status: 'error',
      code: 'AI_UNAVAILABLE',
      billing: 'unknown',
    });
    expect(
      toCitationFailure({
        status: 502,
        code: 'INVALID_AI_OUTPUT',
        billingStatus: 'settled',
      })
    ).toEqual({
      status: 'error',
      code: 'INVALID_AI_OUTPUT',
      billing: 'settled',
    });
    expect(
      toCitationFailure({ status: 403, code: 'CREDITS_EXHAUSTED' })
    ).toEqual({
      status: 'unavailable',
      reason: 'insufficient_credits',
    });
  });
  it('fails closed with typed reasons and never surfaces server text', () => {
    expect(
      toCitationFailure({ status: 503, message: 'LIBRARY_UNAVAILABLE' })
    ).toEqual({
      status: 'unavailable',
      reason: 'not_provisioned',
    });
    expect(
      toCitationFailure({ status: 402, code: 'INSUFFICIENT_CREDITS' })
    ).toEqual({
      status: 'unavailable',
      reason: 'insufficient_credits',
    });
    expect(toCitationFailure({ status: 403, message: 'FORBIDDEN' })).toEqual({
      status: 'unavailable',
      reason: 'forbidden',
    });
    expect(
      toCitationFailure({ status: 500, message: 'database exploded at host x' })
    ).toEqual({
      status: 'error',
      code: 'UPSTREAM_ERROR',
    });
  });

  it('accepts only canonical repaired works', () => {
    expect(parseRepairResponse({ work: { title: 'x' } })).toEqual({
      status: 'error',
      code: 'INVALID_RESPONSE',
    });
    const ok = parseRepairResponse({
      work: work('r', 'Repaired Title', 'Vo'),
      uncertainFields: ['issued', 3],
      billing: { status: 'settled', creditsDeducted: 2.5 },
    });
    expect(ok).toMatchObject({
      status: 'ok',
      data: {
        summary: { title: 'Repaired Title' },
        uncertainFields: ['issued'],
        creditsDeducted: 2.5,
      },
    });
  });
});

import { type CiteWork, CiteWorkSchema } from '@tuturuuu/cite';
import { describe, expect, it, vi } from 'vitest';
import { createDocumentCitationAdapter } from './document-citation-adapter';
import {
  editableWork,
  manualDraftFromWork,
  mergeEditedWork,
} from './manual-work-edit';

const saved = CiteWorkSchema.parse({
  id: 'library:synthetic-chapter',
  type: 'book-chapter',
  title: 'A Synthetic Chapter',
  authors: [
    {
      kind: 'person',
      family: 'Tran',
      given: 'Minh',
      middle: 'Q.',
      orcid: '0000-0002-1825-0097',
    },
  ],
  editors: [
    { kind: 'organization', name: 'Example Collective', acronym: 'EC' },
  ],
  issued: { year: 2021, circa: true },
  containerTitle: 'Synthetic Essays on Rivers',
  publisher: 'Synthetic Press',
  publisherPlace: 'Da Nang',
  pages: '10-24',
  arxivId: '2101.00001',
  provenance: {
    sourceCaptureMethod: 'doi',
    verificationStatus: 'verified_registry',
    registry: 'crossref',
  },
});

describe('editing a saved library source', () => {
  it('prefills the canonical type and contributor roles', () => {
    const draft = manualDraftFromWork(saved);
    expect(draft?.type).toBe('book-chapter');
    expect(draft?.contributors.map(({ role, kind }) => [role, kind])).toEqual([
      ['author', 'person'],
      ['editor', 'organization'],
    ]);
    expect(draft?.publisherPlace).toBe('Da Nang');
    expect(draft?.year).toBe('2021');
  });

  it('keeps fields, provenance and contributor details the form does not show', () => {
    const draft = manualDraftFromWork(saved);
    if (!draft) throw new Error('fixture must be editable');
    const result = mergeEditedWork(saved, {
      ...draft,
      title: 'A Revised Synthetic Chapter',
      pages: '',
    });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    const work: CiteWork = result.work;
    expect(work.id).toBe(saved.id);
    expect(work.title).toBe('A Revised Synthetic Chapter');
    expect(work.pages).toBeUndefined();
    expect(work.arxivId).toBe('2101.00001');
    expect(work.provenance).toEqual({
      ...saved.provenance,
      verificationStatus: 'manual',
    });
    expect(work.issued).toEqual({ year: 2021, circa: true });
    expect(work.authors[0]).toMatchObject({
      middle: 'Q.',
      orcid: '0000-0002-1825-0097',
    });
    expect(work.editors).toEqual([
      { kind: 'organization', name: 'Example Collective', acronym: 'EC' },
    ]);
  });

  it('leaves unsupported types opaque instead of downgrading them', () => {
    const social = { ...saved, id: 'library:post', type: 'social-post' };
    expect(editableWork(social)).toBeNull();
    expect(editableWork({ kind: 'future-work', version: 9 })).toBeNull();
    expect(editableWork(saved)).not.toBeNull();
  });

  it('keeps hidden date qualifiers while editing the visible year', () => {
    const qualified = CiteWorkSchema.parse({
      ...saved,
      issued: {
        year: 2021,
        month: 3,
        day: 2,
        circa: true,
        approximate: true,
        season: 'spring',
      },
    });
    const draft = manualDraftFromWork(qualified);
    if (!draft) throw new Error('fixture must be editable');
    const result = mergeEditedWork(qualified, {
      ...draft,
      year: '2022',
      month: '',
      day: '',
    });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready')
      expect(result.work.issued).toEqual({
        year: 2022,
        circa: true,
        approximate: true,
        season: 'spring',
      });
    const noDate = mergeEditedWork(qualified, { ...draft, noDate: true });
    if (noDate.kind === 'ready')
      expect(noDate.work.issued).toEqual({ nd: true });
  });

  it('retains registry verification for an unchanged source', () => {
    const draft = manualDraftFromWork(saved);
    if (!draft) throw new Error('fixture must be editable');
    const result = mergeEditedWork(saved, draft);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready')
      expect(result.work.provenance).toEqual(saved.provenance);
  });
});

describe('raw reference repair', () => {
  it('forwards the pasted text and the same operation id to fix-ref', async () => {
    const run = vi.fn(async () => ({
      status: 'error' as const,
      code: 'BILLING_PENDING',
    }));
    const adapter = createDocumentCitationAdapter({
      repair: { createOperationId: () => 'op-raw', run },
    });
    await adapter.repair?.runRaw?.(
      '  Tran M. 2021 Synthetic rivers  ',
      'op-raw'
    );
    await adapter.repair?.runRaw?.(
      '  Tran M. 2021 Synthetic rivers  ',
      'op-raw'
    );
    expect(run).toHaveBeenNthCalledWith(
      1,
      { raw: 'Tran M. 2021 Synthetic rivers' },
      'op-raw'
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      { raw: 'Tran M. 2021 Synthetic rivers' },
      'op-raw'
    );
  });
});

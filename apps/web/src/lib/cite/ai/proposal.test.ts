import { CiteWorkSchema } from '@tuturuuu/cite';
import { describe, expect, it, vi } from 'vitest';
import { prepareCitationFixProposal } from './proposal';

const now = Date.parse('2026-11-16T00:00:00Z');
const operationId = '019a8b00-0000-7000-8000-000000000001';
const input = { operationId, input: 'A synthetic source citation.' };
const work = CiteWorkSchema.parse({
  id: 'model-controlled-id',
  type: 'journal-article',
  title: 'Synthetic islands',
  authors: [{ kind: 'person', family: 'Vale' }],
  issued: { year: 2024 },
  provenance: { sourceCaptureMethod: 'manual', verificationStatus: 'manual' },
});
const signal = () => new AbortController().signal;

describe('citation AI proposal provenance', () => {
  it('owns identity and provenance even when the model claims verified registry data', async () => {
    const result = await prepareCitationFixProposal(
      {
        ...work,
        provenance: {
          verificationStatus: 'verified_registry',
          registry: 'crossref',
        },
      },
      input,
      async () => null,
      signal(),
      now
    );
    expect(result).toMatchObject({
      work: {
        id: `cite-ai:${operationId}`,
        provenance: {
          sourceCaptureMethod: 'ai_parsed',
          verificationStatus: 'ai_inferred',
          capturedAt: '2026-11-16T00:00:00.000Z',
        },
      },
      needsReview: true,
    });
    expect(result?.work.provenance.registry).toBeUndefined();
  });

  it('preserves existing work identity and reports the actual proposed field differences', async () => {
    const result = await prepareCitationFixProposal(
      { ...work, title: 'Synthetic islands, revised' },
      { ...input, existingWork: work },
      async () => null,
      signal(),
      now
    );
    expect(result?.work.id).toBe(work.id);
    expect(result?.changes).toEqual(['title']);
    expect(result?.uncertainFields).toEqual(['title']);
  });

  it('keeps a supplied identifier only when the registry returns the exact matching hard ID', async () => {
    const proposed = { ...work, doi: '10.1234/synthetic-islands' };
    const registered = CiteWorkSchema.parse({
      ...proposed,
      provenance: {
        sourceCaptureMethod: 'doi',
        verificationStatus: 'verified_registry',
        registry: 'crossref',
      },
    });
    const ground = vi.fn(async () => registered);
    const result = await prepareCitationFixProposal(
      proposed,
      { ...input, input: 'Vale. DOI:10.1234/synthetic-islands' },
      ground,
      signal(),
      now
    );
    expect(result?.work.doi).toBe(proposed.doi);
    expect(result?.grounding).toEqual([{ field: 'doi', status: 'verified' }]);
    expect(result?.uncertainFields).not.toContain('doi');
    expect(result?.work.provenance.verificationStatus).toBe('ai_inferred');
    expect(ground).toHaveBeenCalledTimes(1);
  });

  it('removes an inferred identifier absent from user material without looking it up', async () => {
    const ground = vi.fn(async () => null);
    const result = await prepareCitationFixProposal(
      {
        ...work,
        doi: '10.1234/model-invention',
        url: 'https://example.org/model-invention',
      },
      input,
      ground,
      signal(),
      now
    );
    expect(result?.work.doi).toBeUndefined();
    expect(result?.work.url).toBeUndefined();
    expect(result?.grounding).toEqual([
      { field: 'doi', status: 'not_checked' },
    ]);
    expect(result?.uncertainFields).toEqual(
      expect.arrayContaining(['doi', 'url'])
    );
    expect(ground).not.toHaveBeenCalled();
  });

  it.each(['wrong_identifier', 'scraped_only', 'failed_lookup'])(
    'drops a proposed identifier after %s',
    async (kind) => {
      const proposed = { ...work, doi: '10.1234/synthetic-islands' };
      const ground = async () => {
        if (kind === 'failed_lookup')
          throw new Error('private upstream detail');
        return CiteWorkSchema.parse({
          ...proposed,
          doi:
            kind === 'wrong_identifier' ? '10.1234/other-source' : proposed.doi,
          provenance: {
            sourceCaptureMethod: 'url',
            verificationStatus:
              kind === 'scraped_only' ? 'url_scraped' : 'verified_registry',
          },
        });
      };
      const result = await prepareCitationFixProposal(
        proposed,
        { ...input, input: proposed.doi },
        ground,
        signal(),
        now
      );
      expect(result?.work.doi).toBeUndefined();
      expect(result?.grounding).toEqual([
        { field: 'doi', status: 'unverified' },
      ]);
    }
  );

  it('performs at most two grounding calls and removes unverified later identifiers', async () => {
    const proposed = CiteWorkSchema.parse({
      ...work,
      doi: '10.1234/synthetic-islands',
      isbn: '9780306406157',
      arxivId: '2401.12345',
      pmid: '12345678',
    });
    const registered = CiteWorkSchema.parse({
      ...proposed,
      provenance: {
        sourceCaptureMethod: 'doi',
        verificationStatus: 'verified_registry',
      },
    });
    const ground = vi.fn(async () => registered);
    const result = await prepareCitationFixProposal(
      proposed,
      {
        ...input,
        input:
          '10.1234/synthetic-islands ISBN:9780306406157 arXiv:2401.12345 PMID:12345678',
      },
      ground,
      signal(),
      now
    );
    expect(ground).toHaveBeenCalledTimes(2);
    expect(result?.work.arxivId).toBeUndefined();
    expect(result?.work.pmid).toBeUndefined();
    expect(result?.grounding.slice(2)).toEqual([
      { field: 'arxivId', status: 'not_checked' },
      { field: 'pmid', status: 'not_checked' },
    ]);
  });

  it('does not fetch after cancellation but still preserves a reviewable proposal', async () => {
    const controller = new AbortController();
    controller.abort();
    const ground = vi.fn(async () => null);
    const result = await prepareCitationFixProposal(
      { ...work, doi: '10.1234/synthetic-islands' },
      { ...input, input: '10.1234/synthetic-islands' },
      ground,
      controller.signal,
      now
    );
    expect(result?.work.doi).toBeUndefined();
    expect(ground).not.toHaveBeenCalled();
  });

  it('rejects invalid/oversized canonical output instead of fabricating missing fields', async () => {
    expect(
      await prepareCitationFixProposal(
        { title: '' },
        input,
        async () => null,
        signal(),
        now
      )
    ).toBeNull();
    const many = Array.from({ length: 100 }, () => ({
      kind: 'organization',
      name: 'x'.repeat(2000),
    }));
    expect(
      await prepareCitationFixProposal(
        { ...work, authors: many },
        input,
        async () => null,
        signal(),
        now
      )
    ).toBeNull();
  });
});

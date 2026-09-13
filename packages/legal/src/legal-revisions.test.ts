import { describe, expect, it } from 'vitest';
import { reviseLegalDocument } from './commercial-revisions';
import { getLegalDocument, LEGAL_DOCUMENTS } from './documents';

describe('shared legal revisions', () => {
  it('serves all seven policy documents in both locales as review drafts', () => {
    for (const locale of ['en', 'vi'])
      for (const kind of [
        'terms',
        'privacy',
        'dpa',
        'sla',
        'subprocessors',
        'acceptable-use',
        'community-guidelines',
      ] as const) {
        const document = getLegalDocument(kind, locale);
        expect(document.kind).toBe(kind);
        expect(document.locale).toBe(locale);
        expect(document.reviewRequired).toBe(true);
        expect(document.badge).toBe(
          locale === 'en' ? 'Draft for review' : 'Bản dự thảo cần rà soát'
        );
        expect(document.version).toBe('2026-09-13-draft');
        expect(document.sections.length).toBeGreaterThan(2);
      }
  });
  it('updates the intended clauses after sections and summaries move', () => {
    const document = getLegalDocument('sla', 'en');
    const revised = reviseLegalDocument({
      ...document,
      sections: [...document.sections]
        .reverse()
        .map((section) => ({ ...section, content: 'unchanged sentinel' })),
      summaryRows: [...document.summaryRows].reverse(),
    });
    expect(
      revised.sections.find((section) => section.id === 'sla-claims')?.content
    ).toContain('executed order');
    expect(
      revised.sections.find((section) => section.id === 'sla-exclusions')
        ?.content
    ).toContain('maintenance windows');
    expect(
      revised.sections.find(
        (section) => section.title === 'Definitions and activation'
      )?.content
    ).toBe('unchanged sentinel');
    expect(
      revised.summaryRows.find((row) => row.topic === 'Claims')?.summary
    ).toContain('signed order');
  });
  it('exposes the same current terms through both the getter and registry', () => {
    expect(getLegalDocument('terms', 'en')).toBe(LEGAL_DOCUMENTS.en.terms);
    expect(
      LEGAL_DOCUMENTS.en.terms.sections.some((section) =>
        section.content.includes('Polar Buyer Terms')
      )
    ).toBe(true);
    expect(
      LEGAL_DOCUMENTS.en.privacy.sections.some((section) =>
        section.content.includes('91/2025/QH15')
      )
    ).toBe(true);
  });
});

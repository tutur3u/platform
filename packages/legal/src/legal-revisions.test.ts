import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { reviseLegalDocument } from './commercial-revisions';
import { getLegalDocument } from './documents';
import { getProposedLegalDocument } from './proposed';

// Recovered from c967e8d2db75fc65159c7dcb31ed1b27673ae924, before c0ce0bb108b.
const hashes = {
  en: {
    dpa: '103d06c26c2b148bb1f2ba178e9c649792597f98c3e884efc3c5257ad9ad9593',
    privacy: '4c9ad160b25e8af2a145aa9a271342951364791f17c3d37aff7e6babed808f02',
    sla: '7833e3e96c3c1c851dde649d12492cb3cfdb4165e20551aaffd0b60e0c4d98b5',
    subprocessors:
      '3da59288866bb314214ad75c42d5ea2807b819f03ab9ed6896eee0139cac52ff',
    terms: '0219b7b49ae1c262d8eb2e7288b067c183eabad88d1ba8900554da9863b6b515',
  },
  vi: {
    dpa: '2e5e8f195d2823e9449356221926d1783f91f364c6e241909feb4b869326ea4a',
    privacy: 'a7a809bd25d710f77fb556133705bf4723aaf79a78af744c3e029afd55dcba11',
    sla: '1b7fcb295d3a1ca3ac4fc64b75fde491c84f5e59744dbcb2ed69d93d1d7e21bb',
    subprocessors:
      'ae3203385738a4d82e0a215a2e6ff4a14cbbd97e8518f4f98cc61f49d63734db',
    terms: 'ca183937ac34e341a1462c1a76561105fa84f21ce3bf66f1c186b9326072631c',
  },
} as const;
describe('effective legal publications', () => {
  for (const locale of ['en', 'vi'] as const) {
    for (const kind of [
      'privacy',
      'terms',
      'dpa',
      'sla',
      'subprocessors',
    ] as const) {
      it(`${locale}/${kind} preserves historical text and date`, () => {
        const d = getLegalDocument(kind, locale);
        expect(d.effectiveDate).toBe('2026-08-15');
        expect(d.version).toBe('2026-08-15');
        const text = JSON.stringify({
          effectiveDate: d.effectiveDate,
          sections: d.sections.map(({ content, title }) => ({
            content,
            title,
          })),
          summaryRows: d.summaryRows,
        });
        expect(createHash('sha256').update(text).digest('hex')).toBe(
          hashes[locale][kind]
        );
      });
    }
    for (const kind of ['acceptable-use', 'community-guidelines'] as const) {
      it(`${locale}/${kind} serves the February policy`, () => {
        const d = getLegalDocument(kind, locale);
        expect(d.effectiveDate).toBe('2026-02-06');
        expect(d.version).toBe('2026-02-06');
        const text = JSON.stringify({
          sections: d.sections.map(({ title, content }) => ({
            title,
            content,
          })),
          summaryRows: d.summaryRows,
        });
        expect(createHash('sha256').update(text).digest('hex')).toBe(
          kind === 'acceptable-use'
            ? '2c6f3a4272f5f006046ba02b12c58c2dd706356d504dc9db67df8dfc5026da6e'
            : '8de35afc32efa1feb26fa055a592c7076e60da2018ccdb3312998f037cbf1838'
        );
        expect(d.sections[0]?.title).toBe(
          kind === 'acceptable-use' ? 'Purpose & Scope' : 'Purpose & Values'
        );
      });
    }
    it(`${locale} proposals have no effective date`, () => {
      for (const kind of [
        'privacy',
        'terms',
        'dpa',
        'sla',
        'subprocessors',
        'acceptable-use',
        'community-guidelines',
      ] as const) {
        const d = getProposedLegalDocument(kind, locale);
        expect(d).not.toHaveProperty('effectiveDate');
        expect(d.badge).toBe(locale === 'vi' ? 'Dự kiến' : 'Proposed');
        expect(d.version).toBe('2026-09-13-draft');
      }
    });
  }
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

  it('keeps September billing and privacy updates exclusively proposed', () => {
    expect(
      getProposedLegalDocument('terms', 'en').sections.some((section) =>
        section.content.includes('Polar Buyer Terms')
      )
    ).toBe(true);
    expect(
      getProposedLegalDocument('privacy', 'en').sections.some((section) =>
        section.content.includes('91/2025/QH15')
      )
    ).toBe(true);
    expect(
      getLegalDocument('terms', 'en').sections.some((section) =>
        section.content.includes('Polar Buyer Terms')
      )
    ).toBe(false);
  });
});

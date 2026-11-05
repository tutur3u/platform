import { describe, expect, it } from 'vitest';
import {
  AUGUST_LEGAL_VERSION,
  getLegalDocument,
  getLegalDocumentVersion,
} from '../documents';
import { getLegalNotice, type LegalNoticeConfig, legalNotice } from '../notice';
import type { LegalLocale } from '../types';
import {
  FINAL_SOURCE_SHA256,
  HOLD_UNITS,
  KS_RELEASED,
  RELEASED_HOLDS,
  REVISION_DATE,
  REVISION_KINDS,
  releasedHoldSet,
  renderRevisionDocument,
  renderRevisionDocumentWithReport,
  renderRevisionNotice,
} from './render';
import { revisionSource } from './source/index.generated';
import { structuralProblems } from './structure';

const locales = ['en', 'vi'] as const;
const published = {
  published: true,
  noticeDate: '2026-11-11',
  laterDate: '2026-12-11',
  mobilePrivacyEffectiveDate: '2026-11-11',
  archiveLinks: {
    en: '[Version of 15 August 2026](/legal/archive/2026-08-15)',
    vi: '[Phiên bản ngày 15 tháng 8 năm 2026](/vi/legal/archive/2026-08-15)',
  },
} satisfies LegalNoticeConfig;

const MARKERS =
  /\[(GATE|HOLD|\/HOLD|verify|PENDING|INTERNAL|OWNER|STAGE|EFFECTIVE)|\[N days\]|\[N ngày\]|\{EFFECTIVE DATE\}/u;

function allParts() {
  return REVISION_KINDS.flatMap((kind) =>
    locales.flatMap((locale) =>
      revisionSource.documents[kind][locale].sections.flatMap((section) =>
        section.parts.map((part) => ({ kind, locale, section, part }))
      )
    )
  );
}

describe('2026-11-11 revision source', () => {
  it('is extracted from the frozen FINAL', () => {
    expect(FINAL_SOURCE_SHA256).toBe(
      '1234b293dfb5b83c4cc94ff6716a3a10df6bcd284263e394241ef38e8838a8f6'
    );
    expect(REVISION_DATE).toBe('2026-11-11');
  });

  it('keeps EN/VI parity: same section ids and the same hold units', () => {
    for (const kind of REVISION_KINDS) {
      const [en, vi] = locales.map(
        (locale) => revisionSource.documents[kind][locale]
      );
      expect(vi!.sections.map((s) => s.id)).toEqual(
        en!.sections.map((s) => s.id)
      );
      en!.sections.forEach((section, index) => {
        const holds = (s: typeof section) =>
          s.parts.map((p) => [p.holds ?? [], p.fallbackFor ?? null]);
        expect(holds(vi!.sections[index]!)).toEqual(holds(section));
      });
    }
    expect(revisionSource.notice.vi.table.map((p) => p.holds)).toEqual(
      revisionSource.notice.en.table.map((p) => p.holds)
    );
    expect(renderRevisionNotice('vi').rows).toHaveLength(
      renderRevisionNotice('en').rows.length
    );
  });

  it('registers every hold unit used in the text', () => {
    const used = new Set(
      [
        ...allParts().map(({ part }) => part),
        ...locales.flatMap((l) => revisionSource.notice[l].table),
      ]
        .flatMap((part) => [...(part.holds ?? []), part.fallbackFor ?? []])
        .flat()
    );
    expect([...used].sort()).toEqual(Object.keys(HOLD_UNITS).sort());
  });
});

describe('2026-11-11 revision: shipped hold state', () => {
  it('ships with every HOLD unit held, including the KS group', () => {
    expect(KS_RELEASED).toBe(false);
    expect(RELEASED_HOLDS).toEqual(['gemini-request-logging']);
  });

  for (const locale of locales)
    for (const kind of REVISION_KINDS) {
      it(`${locale} ${kind}: no held text renders and fallbacks do`, () => {
        const released = releasedHoldSet();
        const document = renderRevisionDocument(kind, locale);
        const content = document.sections.map((s) => s.content).join('\n');
        for (const { part } of allParts().filter(
          (p) => p.kind === kind && p.locale === locale
        )) {
          const text = part.text.trim().replace(/^- /gmu, '* ');
          if (text.length < 12) continue;
          const held = (part.holds ?? []).some((id) => !released.has(id));
          if (held) expect(content).not.toContain(text);
          if (part.fallbackFor && !released.has(part.fallbackFor))
            expect(content).toContain(text);
        }
        expect(content).not.toMatch(MARKERS);
      });

      it(`${locale} ${kind}: no orphaned heading, empty section or empty table row`, () => {
        const { document } = renderRevisionDocumentWithReport(kind, locale);
        for (const section of document.sections) {
          expect(section.content.trim()).not.toBe('');
          expect(structuralProblems(section.content)).toEqual([]);
        }
      });
    }

  it('removes only the P12 heading, whose whole body waits for D', () => {
    for (const locale of locales) {
      expect(
        renderRevisionDocumentWithReport('privacy', locale).removedSections
      ).toEqual(['privacy-mobile']);
      for (const kind of ['terms', 'dpa', 'subprocessors'] as const)
        expect(
          renderRevisionDocumentWithReport(kind, locale).removedSections
        ).toEqual([]);
    }
  });

  it('keeps every quoted cross-reference pointing at a rendered heading', () => {
    for (const locale of locales) {
      const docs = REVISION_KINDS.map((kind) =>
        renderRevisionDocument(kind, locale)
      );
      const headings = new Set(
        docs.flatMap((d) => [
          ...d.sections.map((s) => s.title),
          ...d.sections.flatMap((s) =>
            [...s.content.matchAll(/\*\*([^*]+?)\.?\*\*/gu)].map((m) => m[1]!)
          ),
        ])
      );
      const text = docs
        .flatMap((d) => d.sections.map((s) => s.content))
        .join('\n');
      const refs = [
        ...text.matchAll(/(?:see|See|xem mục|xem) "([^"]+)"/gu),
      ].map((m) => m[1]!);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        // Compare without commas: P7 cites "AI, automated processing and
        // integrations" for the P10 title "AI, automated processing, and
        // integrations" (FINAL wording, kept verbatim).
        const key = (text: string) => text.toLowerCase().replaceAll(',', '');
        const resolved = [...headings].some((h) => key(h).startsWith(key(ref)));
        expect(resolved, `${locale}: "${ref}"`).toBe(true);
      }
    }
  });

  for (const locale of locales)
    it(`${locale} notice: held rows stay out; placeholders resolve`, () => {
      const notice = getLegalNotice(locale, published)!;
      const all = [notice.binding, notice.links, ...notice.rows.flat()].join(
        '\n'
      );
      expect(all).not.toMatch(/\{N30\}|\{N\}|\{ARCHIVE_LINKS\}/u);
      expect(all).not.toMatch(MARKERS);
      expect(notice.binding).toContain('2026-11-11');
      expect(notice.rows.flat().join(' ')).toContain('2026-12-11');
      expect(notice.links).toContain('/legal/archive/2026-08-15');
      expect(notice.rows).toHaveLength(17);
      for (const row of notice.rows) {
        expect(row).toHaveLength(4);
        for (const cell of row) expect(cell.trim()).not.toBe('');
      }
    });
});

describe('2026-11-11 revision: release', () => {
  it('the single KS switch releases the KS items everywhere', () => {
    const released = ['gemini-request-logging', 'ks'];
    const ks = (locale: LegalLocale) =>
      REVISION_KINDS.map((kind) =>
        renderRevisionDocument(kind, locale, { released })
          .sections.map((s) => s.content)
          .join('\n')
      ).join('\n');
    expect(ks('en').match(/All AI features are switched off/gu)).toHaveLength(
      5
    );
    expect(ks('vi').match(/Tất cả tính năng AI đều được tắt/gu)).toHaveLength(
      5
    );
    expect(renderRevisionNotice('en', { released }).rows).toHaveLength(18);
    // The registry Gemini row is no longer held: it renders by default.
    for (const locale of locales) {
      const registry = renderRevisionDocument(
        'subprocessors',
        locale
      ).sections.at(-1)!.content;
      expect(registry).toContain('| Google (Gemini API) |');
      expect(registry.indexOf('| Google (Gemini API) |')).toBeGreaterThan(
        registry.indexOf('| Google Cloud |')
      );
    }
  });

  it('a released paired block replaces its fallback', () => {
    for (const locale of locales) {
      const content = renderRevisionDocument('privacy', locale, {
        released: ['r33-r34'],
      }).sections.find((s) => s.id === 'privacy-section-3')!.content;
      expect(content).toMatch(/365/u);
      expect(structuralProblems(content)).toEqual([]);
    }
    const en = renderRevisionDocument('privacy', 'en', {
      released: ['r33-r34'],
    }).sections.find((s) => s.id === 'privacy-section-3')!.content;
    expect(en).not.toContain(
      'AI request metadata and captured AI content are kept until deleted.'
    );
    expect(en).toContain('enforced from 11 November 2026 at the latest');
    expect(en).not.toContain(
      '| AI request metadata (AI developer features) | Until deleted |'
    );
  });

  it('refuses to release a block that still needs a text change', () => {
    expect(() => releasedHoldSet({ released: ['r32'] })).toThrow(
      /text change/u
    );
    expect(() => releasedHoldSet({ released: ['nope'] })).toThrow(/Unknown/u);
  });
});

describe('2026-11-11 revision: publication switch', () => {
  it('the shipped notice is unpublished, so the in-force text is unchanged', () => {
    expect(legalNotice.published).toBe(false);
    for (const locale of locales)
      for (const kind of [...REVISION_KINDS, 'sla'] as const)
        expect(getLegalDocument(kind, locale)).toBe(
          getLegalDocumentVersion(AUGUST_LEGAL_VERSION, kind, locale)
        );
  });

  it('a published notice switches Privacy, Terms, DPA and Subprocessors together', () => {
    for (const locale of locales) {
      for (const kind of REVISION_KINDS) {
        const document = getLegalDocument(kind, locale, published);
        expect(document.effectiveDate).toBe('2026-11-11');
        expect(document.reviewRequired).toBe(false);
        const text = document.sections.map((s) => s.content).join('\n');
        expect(text).not.toMatch(/\{D(_ISO)?\}/u);
      }
      expect(getLegalDocument('sla', locale, published)).toBe(
        getLegalDocumentVersion(AUGUST_LEGAL_VERSION, 'sla', locale)
      );
      // D <= N releases the mobile section and the Firebase rows.
      expect(
        getLegalDocument('privacy', locale, published).sections.some(
          (s) => s.id === 'privacy-mobile'
        )
      ).toBe(true);
    }
    const later = { ...published, mobilePrivacyEffectiveDate: '2026-11-20' };
    expect(
      getLegalDocument('privacy', 'en', later).sections.some(
        (s) => s.id === 'privacy-mobile'
      )
    ).toBe(false);
    // Annex II no longer names the mobile app or Firebase.
    expect(
      getLegalDocument('dpa', 'en', later).sections.find(
        (s) => s.id === 'dpa-annex-2'
      )!.content
    ).not.toMatch(/Firebase|\(mobile; from/u);
  });

  it('refuses a notice date other than the revision date', () => {
    expect(() =>
      getLegalDocument('terms', 'en', {
        ...published,
        noticeDate: '2026-11-12',
      })
    ).toThrow(/revision date/u);
  });
});

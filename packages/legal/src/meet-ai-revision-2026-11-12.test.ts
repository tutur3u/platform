import { describe, expect, it } from 'vitest';
import { getLegalDocument } from './documents';
import {
  MEET_AI_LEGAL_CONTRACTS,
  MEET_AI_LEGAL_SOURCE_SHA,
  MEET_AI_REQUIRED_GATES,
  MEET_AI_REVISION_EVIDENCE,
  reviseMeetAiLegalDocument,
} from './meet-ai-revision-2026-11-12';

describe('Meet AI disclosure draft', () => {
  it.each(['en', 'vi'] as const)(
    'covers Privacy, Terms and subprocessors in %s without activating an agreement',
    (locale) => {
      for (const kind of ['privacy', 'terms', 'subprocessors'] as const) {
        const original = getLegalDocument(kind, locale);
        const before = structuredClone(original);
        const draft = reviseMeetAiLegalDocument(original);
        expect(original).toEqual(before);
        expect(draft.effectiveDate).toBe(original.effectiveDate);
        expect(draft.publishedDate).toBe('2026-11-12');
        expect(draft.version).toBe('2026-11-12-meet-ai-draft');
        expect(draft.reviewRequired).toBe(true);
        expect(draft.sections.slice(0, original.sections.length)).toEqual(
          original.sections
        );
        const additions = draft.sections.slice(original.sections.length);
        expect(additions.length).toBeGreaterThan(0);
        expect(additions.map((section) => section.content).join(' ')).toContain(
          'UNKNOWN'
        );
        expect(reviseMeetAiLegalDocument(draft)).toEqual(draft);
      }
    }
  );

  it.each(['en', 'vi'] as const)('preserves unrelated %s documents', (locale) => {
    for (const kind of ['dpa', 'sla', 'acceptable-use', 'community-guidelines'] as const) {
      const document = getLegalDocument(kind, locale);
      expect(reviseMeetAiLegalDocument(document)).toBe(document);
    }
  });

  it('keeps every added disclosure linked to immutable source evidence', () => {
    expect(MEET_AI_LEGAL_SOURCE_SHA).toBe(
      'f83e4ddf0d68a33f7b7b13c8ab3421de877a374d'
    );
    for (const locale of ['en', 'vi'] as const) {
      for (const kind of ['privacy', 'terms', 'subprocessors'] as const) {
        const draft = reviseMeetAiLegalDocument(getLegalDocument(kind, locale));
        for (const section of draft.sections.filter((item) => item.id?.startsWith('meet-ai-'))) {
          const evidence = MEET_AI_REVISION_EVIDENCE[section.id!];
          expect(evidence?.length).toBeGreaterThan(0);
          for (const reference of evidence ?? []) {
            expect(reference).toMatch(/^[^:]+:\d+$/);
          }
        }
      }
    }
  });

  it('pins both contracts and keeps future enforcement separate from processing disclosures', () => {
    expect(MEET_AI_LEGAL_CONTRACTS).toEqual({
      v1: '1fe1924bc17c843cfd524df87dc81c0b3d68b7f58a531a553a57b6ff29a2a1cc',
      v1_1: '6963adc4995ecb9f9648943caccf58a107e993eb93e6125a6a1fde3e9363021c',
    });
    expect(MEET_AI_REQUIRED_GATES.status).toBe('required-not-verified-live');
    expect(MEET_AI_REQUIRED_GATES.billingRecheckMaxSeconds).toBe(300);
    expect(MEET_AI_REQUIRED_GATES.billingAuthority).toBe('server-billing-truth');
    expect(MEET_AI_REQUIRED_GATES.unknownBilling).toBe('deny');
    expect(MEET_AI_REQUIRED_GATES.guests).toBe('separate-change');
    const privacy = reviseMeetAiLegalDocument(getLegalDocument('privacy', 'en'));
    const copy = privacy.sections.filter((section) => section.id?.startsWith('meet-ai-'));
    expect(copy.map((section) => section.content).join(' ')).not.toContain(
      'paid-plan entitlement is enforced'
    );
  });
});

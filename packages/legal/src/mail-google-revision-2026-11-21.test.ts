import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getLegalDocument, LEGAL_DOCUMENTS } from './documents';
import {
  MAIL_GOOGLE_LEGAL_DATE,
  MAIL_GOOGLE_LEGAL_SOURCE_SHA,
  MAIL_GOOGLE_PERMISSIONS_URL,
  MAIL_GOOGLE_REVISION_EVIDENCE,
  MAIL_GOOGLE_USER_DATA_POLICY_URL,
  proposeMailGoogleLegalPublication,
  reviseMailGoogleLegalDocument,
} from './mail-google-revision-2026-11-21';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const approvedEnglish =
  "When you connect a Gmail account, Tuturuuu Mail accesses your Gmail messages, labels and drafts through the Gmail API to show, organize and send your mail at your direction. Tuturuuu's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy (https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. We do not use Gmail data for advertising, do not sell it, and do not use it to train generalized AI/ML models. Connection credentials are encrypted at rest. You can disconnect at any time in Mail settings or at https://myaccount.google.com/permissions, after which we stop accessing your account and delete the stored tokens.";

const mailSection = (locale: 'en' | 'vi') =>
  getLegalDocument('privacy', locale).sections.find(
    (section) => section.id === 'mail-google-user-data'
  );

describe('Mail Google user data disclosure', () => {
  it('publishes the approved English text verbatim', () => {
    const section = mailSection('en');
    expect(section?.title).toBe('Google user data in Tuturuuu Mail');
    expect(section?.content).toBe(approvedEnglish);
  });

  it('keeps the URLs and policy names in English in the Vietnamese text', () => {
    const section = mailSection('vi');
    expect(section?.title).toBe(
      'Dữ liệu người dùng Google trong Tuturuuu Mail'
    );
    for (const term of [
      MAIL_GOOGLE_USER_DATA_POLICY_URL,
      MAIL_GOOGLE_PERMISSIONS_URL,
      'Google API Services User Data Policy',
      'Limited Use',
      'Gmail API',
    ])
      expect(section?.content).toContain(term);
    expect(section?.content).toContain('AI/ML');
  });

  it.each(['en', 'vi'] as const)(
    'dates the %s Privacy Policy and keeps every earlier section in order',
    (locale) => {
      const document = getLegalDocument('privacy', locale);
      expect(document.effectiveDate).toBe(MAIL_GOOGLE_LEGAL_DATE);
      expect(document.publishedDate).toBe(MAIL_GOOGLE_LEGAL_DATE);
      expect(document.version).toBe(MAIL_GOOGLE_LEGAL_DATE);
      expect(document.reviewRequired).toBe(true);
      expect(document.badge).toBe(LEGAL_DOCUMENTS[locale].privacy.badge);
      expect(document.sections.at(-1)?.id).toBe('mail-google-user-data');
      expect(
        document.sections.filter(
          (section) => section.id === 'mail-google-user-data'
        )
      ).toHaveLength(1);
      expect(
        document.sections.some((section) => section.id === 'meet-ai-inputs')
      ).toBe(true);
    }
  );

  it.each(['en', 'vi'] as const)(
    'leaves other %s documents and the source object unchanged',
    (locale) => {
      const original = LEGAL_DOCUMENTS[locale].privacy;
      const before = structuredClone(original);
      const revised = reviseMailGoogleLegalDocument(original);
      expect(original).toEqual(before);
      expect(reviseMailGoogleLegalDocument(revised)).toBe(revised);
      for (const kind of ['terms', 'dpa', 'sla', 'subprocessors'] as const) {
        const document = LEGAL_DOCUMENTS[locale][kind];
        expect(reviseMailGoogleLegalDocument(document)).toBe(document);
        expect(proposeMailGoogleLegalPublication(document)).toBe(document);
        expect(
          getLegalDocument(kind, locale).sections.some(
            (section) => section.id === 'mail-google-user-data'
          )
        ).toBe(false);
      }
    }
  );

  it('links the disclosure to pinned source evidence in existing files', () => {
    expect(MAIL_GOOGLE_LEGAL_SOURCE_SHA).toMatch(/^[0-9a-f]{40}$/u);
    const evidence = MAIL_GOOGLE_REVISION_EVIDENCE['mail-google-user-data'];
    expect(evidence?.length).toBeGreaterThan(0);
    for (const reference of evidence ?? []) {
      expect(reference).toMatch(/^[^:]+:\d+$/u);
      const [path] = reference.split(':');
      expect(existsSync(resolve(repositoryRoot, path!))).toBe(true);
    }
    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/connected\/crypto\.ts:/u),
        expect.stringMatching(/connected\/route\.ts:/u),
        expect.stringMatching(/connected\/config\.ts:/u),
      ])
    );
  });
});

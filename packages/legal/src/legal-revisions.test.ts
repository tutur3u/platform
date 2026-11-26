import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { reviseLegalDocument } from './commercial-revisions';
import { getLegalDocument, LEGAL_DOCUMENTS } from './documents';
import { getProposedLegalDocument } from './proposed';
import { getLegalRevision, upcomingMobilePrivacyRevision } from './revisions';

// Recovered from c967e8d2db75fc65159c7dcb31ed1b27673ae924, before c0ce0bb108b.
const footers = {
  en: {
    privacy:
      'Questions and rights requests may be sent to privacy@tuturuuu.com. This draft requires legal review before production publication.',
    terms:
      'These Terms are a counsel-review draft. Enterprise order forms and mandatory consumer law may add or override terms.',
    dpa: 'The DPA forms part of an applicable customer agreement when Tuturuuu processes personal data on the customer’s behalf.',
    sla: 'No numerical uptime commitment or service credit applies unless an enterprise order form expressly activates it.',
    subprocessors:
      'The registry is maintained as providers change. Customers with contractual notice rights receive applicable material-change notices.',
  },
  vi: {
    privacy:
      'Gửi câu hỏi hoặc yêu cầu về quyền dữ liệu đến privacy@tuturuuu.com. Bản dự thảo này cần được rà soát pháp lý trước khi công bố.',
    terms:
      'Điều khoản này là bản dự thảo chờ rà soát pháp lý. Đơn đặt hàng doanh nghiệp và luật bảo vệ người tiêu dùng bắt buộc có thể bổ sung hoặc thay thế.',
    dpa: 'DPA là một phần của thỏa thuận khách hàng áp dụng khi Tuturuuu xử lý dữ liệu cá nhân thay mặt khách hàng.',
    sla: 'Không có cam kết thời gian hoạt động hoặc tín dụng dịch vụ nếu đơn đặt hàng doanh nghiệp không kích hoạt rõ ràng.',
    subprocessors:
      'Danh mục được duy trì khi nhà cung cấp thay đổi. Khách hàng có quyền thông báo theo hợp đồng sẽ nhận thông báo phù hợp.',
  },
} as const;

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
const meetPublicationHashes = {
  en: {
    privacy: '087b7cf68e837692dfd4ee3ec5bea65b6faff9edd976d91faad7df113a2ab23d',
    terms: 'ea66220bcf79da35a338f9b2f01deffee031e7dcb82d62042423e73d8d54b038',
    subprocessors:
      '2d0e2b2edc81b146e2f936094cb4b736d8eec24cbcaf8695d17ed64387ab7277',
  },
  vi: {
    privacy: 'cf48c4eb8d12f71fc2e5b1cc6cf01f73211564b05e6fac1ca1dfbbbb1a95a24c',
    terms: '4a854bc70815c268a0b3bfdc7dd1cdf44a3a31debe682776f72fea604283f837',
    subprocessors:
      'b8ace31386edeb5bc6a41d3dcdcfc77f8ef65f27595bf32df2e51925f7320073',
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
        const d = LEGAL_DOCUMENTS[locale][kind];
        expect(d.effectiveDate).toBe('2026-08-15');
        expect(d.version).toBe('2026-08-15');
        expect(d.footer).toBe(footers[locale][kind]);
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
    for (const kind of ['privacy', 'terms', 'subprocessors'] as const) {
      it(`${locale}/${kind} consumes the proposed dated canonical publications`, () => {
        const baseline = LEGAL_DOCUMENTS[locale][kind];
        const document = getLegalDocument(kind, locale);
        const date =
          kind === 'privacy' || kind === 'subprocessors'
            ? '2026-11-26'
            : '2026-11-12';
        expect(document.effectiveDate).toBe(date);
        expect(document.publishedDate).toBe(date);
        expect(document.version).toBe(date);
        expect(document.reviewRequired).toBe(true);
        expect(document.footer).toBe(baseline.footer);
        expect(document.summaryRows).toEqual(baseline.summaryRows);
        expect(
          document.sections
            .slice(0, baseline.sections.length)
            .map((section) => section.id)
        ).toEqual(baseline.sections.map((section) => section.id));
        if (kind === 'terms') {
          expect(document.sections.slice(0, baseline.sections.length)).toEqual(
            baseline.sections
          );
        }
        const additions = document.sections.slice(baseline.sections.length);
        expect(additions.length).toBeGreaterThan(0);
        expect(
          additions.every(
            (section) =>
              section.id?.startsWith('meet-ai-') ||
              (kind === 'privacy' &&
                (section.id === 'mail-google-user-data' ||
                  section.id === 'privacy-mobile')) ||
              (kind === 'subprocessors' &&
                section.id?.startsWith('subprocessors-mobile-'))
          )
        ).toBe(true);
        const text = JSON.stringify({
          effectiveDate: document.effectiveDate,
          sections: document.sections.map(({ content, title }) => ({
            content,
            title,
          })),
          summaryRows: document.summaryRows,
        });
        expect(createHash('sha256').update(text).digest('hex')).toBe(
          meetPublicationHashes[locale][kind]
        );
      });
    }
    it(`${locale} unrelated canonical publications retain identity`, () => {
      expect(getLegalDocument('dpa', locale)).toBe(LEGAL_DOCUMENTS[locale].dpa);
      expect(getLegalDocument('sla', locale)).toBe(LEGAL_DOCUMENTS[locale].sla);
    });
    it(`${locale} freezes commercial proposals while mobile inherits current`, () => {
      for (const kind of ['privacy', 'terms', 'subprocessors'] as const) {
        expect(getLegalRevision(kind, locale, '2026-09-13-draft')).toEqual(
          reviseLegalDocument(LEGAL_DOCUMENTS[locale][kind])
        );
        const proposed = getProposedLegalDocument(kind, locale);
        expect(proposed.version).toBe('2026-11-02');
        expect(proposed.reviewRequired).toBe(true);
        expect(
          proposed.sections.some((section) =>
            section.id?.startsWith('meet-ai-')
          )
        ).toBe(false);
      }
      const current = getLegalDocument('privacy', locale);
      const mobile = getLegalRevision(
        'privacy',
        locale,
        upcomingMobilePrivacyRevision.version
      );
      expect(mobile.sections).toEqual(current.sections);
      expect(mobile.effectiveDate).toBe('2026-11-26');
      expect(mobile.published).toBe(true);
      expect(mobile.reviewRequired).toBe(true);
    });
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
    it(`${locale} proposed safety policies retain all sections`, () => {
      expect(
        getProposedLegalDocument('acceptable-use', locale).sections
      ).toHaveLength(8);
      expect(
        getProposedLegalDocument('community-guidelines', locale).sections
      ).toHaveLength(7);
    });
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
        expect(d.version).toBe('2026-11-02');
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

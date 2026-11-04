import { getLegalDocument, getProposedLegalDocument } from '@tuturuuu/legal';
import { describe, expect, it } from 'vitest';
import { stripInternalReviewSentences } from '../src/components/legal/proposal-footer';

const privacy = {
  en: {
    proposal:
      'Not yet in effect. Questions and rights requests may be sent to privacy@tuturuuu.com.',
    current:
      'Questions and rights requests may be sent to privacy@tuturuuu.com. This draft requires legal review before production publication.',
  },
  vi: {
    proposal:
      'Chưa có hiệu lực. Gửi câu hỏi hoặc yêu cầu về quyền dữ liệu đến privacy@tuturuuu.com.',
    current:
      'Gửi câu hỏi hoặc yêu cầu về quyền dữ liệu đến privacy@tuturuuu.com. Bản dự thảo này cần được rà soát pháp lý trước khi công bố.',
  },
};

describe('proposal footer presentation', () => {
  for (const locale of ['en', 'vi'] as const) {
    it(`${locale}: preserves exact privacy contact and in-force footer`, () => {
      expect(
        stripInternalReviewSentences(
          getProposedLegalDocument('privacy', locale).footer
        )
      ).toBe(privacy[locale].proposal);
      expect(getLegalDocument('privacy', locale).footer).toBe(
        privacy[locale].current
      );
    });
    for (const kind of [
      'terms',
      'dpa',
      'sla',
      'subprocessors',
      'acceptable-use',
      'community-guidelines',
    ] as const) {
      it(`${locale}/${kind}: changes only proposal status and review sentences`, () => {
        const footer = getProposedLegalDocument(kind, locale).footer;
        const prefix =
          locale === 'en'
            ? 'Draft revision for review; not a newly effective agreement.'
            : 'Bản sửa đổi để rà soát; chưa phải thỏa thuận mới có hiệu lực.';
        const status =
          locale === 'en' ? 'Not yet in effect.' : 'Chưa có hiệu lực.';
        const contact = footer
          .slice(prefix.length)
          .trim()
          .split(/(?<=[.!?])\s+/u)
          .filter(
            (sentence) =>
              !/requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý/iu.test(
                sentence
              )
          )
          .join(' ');
        expect(stripInternalReviewSentences(footer)).toBe(
          `${status} ${contact}`
        );
      });
    }
  }
});

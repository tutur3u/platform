// @vitest-environment jsdom
import { getLegalDocument } from '@tuturuuu/legal';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '../app/[locale]/(marketing)/privacy/page';
import TermsPage from '../app/[locale]/(marketing)/terms/page';
import DpaPage from '../app/[locale]/(marketing)/legal/dpa/page';
import SlaPage from '../app/[locale]/(marketing)/legal/sla/page';
import AcceptableUsePage from '../app/[locale]/(marketing)/acceptable-use/page';
import CommunityPage from '../app/[locale]/(marketing)/community-guidelines/page';
import SubprocessorsPage from '../app/[locale]/(marketing)/legal/subprocessors/page';

const banned =
  /requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý|Proposed updates to this document|Upcoming changes|Các cập nhật dự kiến cho tài liệu này|Thay đổi sắp tới/iu;

describe('production legal notices', () => {
  for (const locale of ['en', 'vi'] as const) {
    for (const [kind, Page] of [
      ['privacy', PrivacyPage],
      ['terms', TermsPage],
      ['dpa', DpaPage],
      ['sla', SlaPage],
      ['subprocessors', SubprocessorsPage],
      ['acceptable-use', AcceptableUsePage],
      ['community-guidelines', CommunityPage],
    ] as const) {
      it(`${locale}/${kind}: hides internal notices and preserves the public footer`, async () => {
        const html = renderToStaticMarkup(
          await Page({ params: Promise.resolve({ locale }) })
        );
        const page = new DOMParser().parseFromString(html, 'text/html');
        expect(page.body.textContent).not.toMatch(banned);
        expect(page.querySelector('a[href*="/legal/changes"]')).toBeNull();
        const stored = getLegalDocument(kind, locale).footer;
        const publicSentences = stored
          .split(/(?<=[.!?])\s+/u)
          .filter((sentence) => !banned.test(sentence));
        expect(publicSentences.length).toBeGreaterThan(0);
        for (const sentence of publicSentences)
          expect(page.body.textContent).toContain(sentence);
        if (kind === 'privacy')
          expect(page.body.textContent).toContain(
            locale === 'en'
              ? 'Questions and rights requests may be sent to privacy@tuturuuu.com.'
              : 'Gửi câu hỏi hoặc yêu cầu về quyền dữ liệu đến privacy@tuturuuu.com.'
          );
        expect(getLegalDocument(kind, locale).footer).toBe(stored);
      });
    }
  }
});

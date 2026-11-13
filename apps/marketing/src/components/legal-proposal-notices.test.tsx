// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegalChanges } from './legal/legal-changes';

describe('proposal legal notices', () => {
  for (const locale of ['en', 'vi'] as const)
    for (const full of [false, true])
      it(`${locale}, full=${full}: omits review annotations and preserves proposal status`, () => {
        const page = new DOMParser().parseFromString(
          renderToStaticMarkup(<LegalChanges locale={locale} full={full} />),
          'text/html'
        );
        expect(page.body.textContent).not.toMatch(
          /requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý/iu
        );
        expect(page.body.textContent).toContain(
          locale === 'en'
            ? 'These updates are not yet in effect.'
            : 'Các cập nhật này chưa có hiệu lực.'
        );
        if (full) {
          expect(
            page.querySelector('article[id="privacy"] footer p')?.textContent
          ).toBe(
            locale === 'en'
              ? 'Not yet in effect. Questions and rights requests may be sent to privacy@tuturuuu.com.'
              : 'Chưa có hiệu lực. Gửi câu hỏi hoặc yêu cầu về quyền dữ liệu đến privacy@tuturuuu.com.'
          );
          expect(
            page
              .querySelector('article[id="terms"] footer a')
              ?.getAttribute('href')
          ).toBe(locale === 'en' ? '/terms' : '/vi/terms');
        }
      });
});

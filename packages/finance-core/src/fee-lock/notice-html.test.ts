import { describe, expect, it } from 'vitest';
import { DEFAULT_FEE_NOTICE_TEMPLATE, renderFeeNotice } from './notice';
import { escapeFeeNoticeHtml } from './notice-html';

describe('escapeFeeNoticeHtml', () => {
  it('escapes markup, quotes and ampersands, and keeps line breaks', () => {
    expect(
      escapeFeeNoticeHtml(`<img src=x onerror="alert('x')"> & co\nnext`)
    ).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; co<br>next'
    );
  });

  it('leaves no live markup in a notice rendered from hostile names', () => {
    // biome-ignore format: compact fixture
    const [notice] = renderFeeNotice(
      {
        student_name: '<script>alert(1)</script>',
        period_month: '2026-12-01',
        currency: 'VND',
        total_amount: 800_000,
        lines: [
          { kind: 'tuition', group_id: null, group_name: '<b>Lớp A</b>', label: 'Học phí', unit_label: 'buổi', unit_price: 100_000, quantity: 8, line_amount: 800_000, sort_order: 0 },
        ],
      },
      DEFAULT_FEE_NOTICE_TEMPLATE,
      { centreName: 'Trung tâm "A&B"' }
    );
    const html = escapeFeeNoticeHtml(notice?.text ?? '');
    expect(notice?.text).toContain('<script>');
    expect(html).not.toMatch(/<(?!br>)/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Trung tâm &quot;A&amp;B&quot;');
  });
});

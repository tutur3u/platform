import { describe, expect, it } from 'vitest';
import { type ReportEmailData, renderReportEmail } from './email-template';

const report: ReportEmailData = {
  title: 'BẢNG ĐÁNH GIÁ THÁNG 08/2026',
  content: 'Unit 4: Yummy Food!\n- Vocabulary: apples & pears',
  feedback: 'Tiếp tục luyện tập.',
  score: 93,
  userName: 'Học viên mẫu',
  groupName: 'ESI2',
  teacherName: 'Giáo viên mẫu',
};
const configs = {
  BRAND_NAME: 'Easy Center',
  BRAND_LOGO_URL: 'https://example.com/logo.png',
  BRAND_PHONE_NUMBER: '(0258) 6 557 457',
  BRAND_LOCATION: 'Nha Trang',
  REPORT_INTRO:
    'Học viên {{user_name}}, lớp {{ group_name }}, giáo viên {{group_manager_name}}.',
  REPORT_CONTENT_TEXT: 'NỘI DUNG ĐÃ HỌC TRONG THÁNG',
  REPORT_SCORE_TEXT: 'ĐIỂM TRUNG BÌNH (THANG ĐIỂM 100)',
  REPORT_FEEDBACK_TEXT: 'NHẬN XÉT CHUNG',
  REPORT_CONCLUSION: 'Cảm ơn Quý phụ huynh.',
  REPORT_CLOSING: 'Trung tâm anh ngữ EASY',
};
describe('branded periodic report email', () => {
  it('includes every configured section, identity and saved score in recipient order', () => {
    const html = renderReportEmail(report, configs);
    for (const value of [
      'https://example.com/logo.png',
      '(0258) 6 557 457',
      '<strong>Học viên mẫu</strong>',
      '<strong>ESI2</strong>',
      '<strong>Giáo viên mẫu</strong>',
      '93.0',
      'NỘI DUNG ĐÃ HỌC TRONG THÁNG',
      'NHẬN XÉT CHUNG',
      'Cảm ơn Quý phụ huynh.',
      'Trung tâm anh ngữ EASY',
      'Nha Trang',
    ])
      expect(html).toContain(value);
    expect(html.indexOf(report.content!.split('\n')[0]!)).toBeLessThan(
      html.indexOf(report.feedback!)
    );
    expect(html).not.toContain('{{');
  });
  it('escapes all report, substitution and configuration markup', () => {
    const html = renderReportEmail(
      {
        ...report,
        title: '<script>alert(1)</script>',
        userName: '<img src=x onerror=alert(1)>',
        content: '<a href="javascript:alert(1)">link</a>',
      },
      {
        ...configs,
        BRAND_NAME: '"><script>x</script>',
        BRAND_LOGO_URL: 'javascript:alert(1)',
        REPORT_CONCLUSION: '<iframe src=x></iframe>',
      }
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<img ');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });
  it('keeps zero scores and omits unavailable scores or empty feedback', () => {
    expect(renderReportEmail({ ...report, score: 0 }, {})).toContain('0.0');
    const html = renderReportEmail(
      { ...report, score: null, feedback: '' },
      {}
    );
    expect(html).not.toContain('font-size:36px');
    expect(html).not.toContain('Nhận xét chung');
    expect(html).toContain('Học viên mẫu · ESI2 · Giáo viên mẫu');
  });
  it('preserves long content and uses a fluid email-safe layout without scripts', () => {
    const content = 'Nội dung dài\n'.repeat(300);
    const html = renderReportEmail(
      { ...report, content, score: null },
      configs
    );
    expect(html.match(/Nội dung dài/g)).toHaveLength(300);
    expect(html).toContain('max-width:760px');
    expect(html).toContain('width="100%"');
    expect(html).not.toContain('<script');
  });
});

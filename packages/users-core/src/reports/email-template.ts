/** Email-safe report layout. The delivery preview and worker use this same renderer. */
export interface ReportEmailData {
  title: string | null;
  content: string | null;
  feedback: string | null;
  score: number | null;
  userName: string | null;
  groupName: string | null;
  teacherName: string | null;
}

export function escapeReportText(value: string | null | undefined): string {
  return (value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!
  );
}

function logoUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' ? escapeReportText(url.href) : '';
  } catch {
    return '';
  }
}

export function renderReportEmail(
  report: ReportEmailData,
  configs: Record<string, string>
) {
  const text = (value: string | null | undefined) =>
    escapeReportText(value).replace(/\r?\n/g, '<br />');
  const dynamicText = (value: string) =>
    value
      .split(/({{.*?}})/g)
      .map((part) => {
        const key = part.match(/^{{\s*(.*?)\s*}}$/)?.[1];
        const names: Record<string, string | null> = {
          user_name: report.userName,
          group_name: report.groupName,
          group_manager_name: report.teacherName,
        };
        return key && key in names
          ? `<strong>${text(names[key] || '…')}</strong>`
          : text(part);
      })
      .join('');
  const vietnamese = /[ăâđêôơư]|THÁNG/i.test(
    Object.values(configs).join(' ') + report.title
  );
  const labels = vietnamese
    ? {
        report: 'Báo cáo học tập',
        content: 'Nội dung đã học trong tháng',
        score: 'Điểm đánh giá',
        feedback: 'Nhận xét chung',
      }
    : {
        report: 'Progress report',
        content: 'Learning content',
        score: 'Representative score',
        feedback: 'Feedback and next steps',
      };
  const heading = (value: string) =>
    `<p style="margin:0 0 16px;color:#64748b;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase">${text(value)}</p>`;
  const section = (
    label: string,
    body: string,
    background = '#ffffff',
    border = '#e2e8f0'
  ) =>
    `<tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${border};border-radius:24px;background:${background}"><tr><td style="padding:24px">${heading(label)}<div style="font-size:15px;line-height:1.85;overflow-wrap:anywhere">${body}</div></td></tr></table></td></tr>`;
  const logo = logoUrl(configs.BRAND_LOGO_URL);
  const title =
    report.title?.trim() ||
    [configs.REPORT_TITLE_PREFIX, configs.REPORT_TITLE_SUFFIX]
      .filter(Boolean)
      .join(' ') ||
    labels.report;
  const contentLabel = configs.REPORT_CONTENT_TEXT?.trim() || labels.content;
  const scoreLabel = configs.REPORT_SCORE_TEXT?.trim() || labels.score;
  const feedbackLabel = configs.REPORT_FEEDBACK_TEXT?.trim() || labels.feedback;
  const intro = configs.REPORT_INTRO?.trim();
  const identity = [report.userName, report.groupName, report.teacherName]
    .filter(Boolean)
    .map(text)
    .join(' · ');
  const body = [
    section(labels.report, intro ? dynamicText(intro) : identity, '#f8fafc'),
    report.score !== null && Number.isFinite(report.score)
      ? `<tr><td style="padding-bottom:20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="60%" valign="top" style="padding:20px;border:1px solid #a5f3fc;border-radius:24px;background:#ecfeff">${heading(contentLabel)}<div style="font-size:15px;line-height:1.8">${text(report.content?.split('\n').find((line) => line.trim()) || '')}</div></td><td width="12"></td><td valign="top" style="padding:20px;border:1px solid #fde68a;border-radius:24px;background:#fffbeb">${heading(scoreLabel)}<strong style="font-size:36px;line-height:1.2;font-variant-numeric:tabular-nums">${report.score.toFixed(1)}</strong></td></tr></table></td></tr>`
      : '',
    section(contentLabel, text(report.content)),
    report.feedback?.trim()
      ? section(feedbackLabel, text(report.feedback), '#f8fafc')
      : '',
    configs.REPORT_CONCLUSION?.trim()
      ? section(
          labels.report,
          dynamicText(configs.REPORT_CONCLUSION),
          '#ecfeff',
          '#a5f3fc'
        )
      : '',
    configs.REPORT_CLOSING?.trim()
      ? `<tr><td style="padding:8px 0 24px;font-size:15px;line-height:1.8">${dynamicText(configs.REPORT_CLOSING)}</td></tr>`
      : '',
  ].join('');
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${text(title)}</title></head><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px"><tr><td style="padding:28px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding-bottom:24px;border-bottom:1px solid #e2e8f0">${logo ? `<img src="${logo}" alt="${escapeReportText(configs.BRAND_NAME || labels.report)}" width="120" style="max-width:120px;height:auto;display:block" />` : `<strong>${text(configs.BRAND_NAME || labels.report)}</strong>`}</td><td align="right" style="padding-bottom:24px;border-bottom:1px solid #e2e8f0;font-size:12px;letter-spacing:1px">${text(configs.BRAND_PHONE_NUMBER)}</td></tr><tr><td colspan="2" style="padding:28px 0;text-align:center">${heading(labels.report)}<h1 style="margin:0;font-size:28px;line-height:1.35;overflow-wrap:anywhere">${text(title)}</h1></td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${body}</table><div style="border-top:1px solid #e2e8f0;padding-top:20px;color:#64748b;font-size:12px;line-height:1.6">${text(configs.BRAND_NAME)}${configs.BRAND_LOCATION ? `<br />${text(configs.BRAND_LOCATION)}` : ''}</div></td></tr></table></td></tr></table></body></html>`;
}

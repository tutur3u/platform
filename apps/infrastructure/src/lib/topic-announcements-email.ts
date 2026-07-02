import { normalizeTopicAnnouncementAttachmentFileName } from './topic-announcement-attachments';

export function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface TopicAnnouncementEmailAttachmentSummary {
  contentType?: string | null;
  fileName: string;
  sizeBytes: number;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.ceil(value / 1024)} KB`;
  }
  return `${value} B`;
}

function formatTimeRange(startTime?: string | null, endTime?: string | null) {
  return [startTime, endTime]
    .filter(Boolean)
    .map((time) => time?.replace(/:00$/u, ''))
    .join(' - ');
}

function renderMessageHtml(value: string) {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => htmlEscape(paragraph.trim()).replaceAll('\n', '<br />'))
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0;color:#1f2937;font-size:15px;line-height:24px">${paragraph}</p>`
    )
    .join('');
}

function renderDetailRows(details: [string, string][]) {
  if (details.length === 0) return '';

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:8px">
      <tbody>
        ${details
          .map(
            ([label, value]) => `
              <tr>
                <td style="width:120px;border-top:1px solid #e5e7eb;padding:10px 12px 10px 0;color:#6b7280;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.04em">${htmlEscape(label)}</td>
                <td style="border-top:1px solid #e5e7eb;padding:10px 0;color:#111827;font-size:14px;line-height:20px;font-weight:600">${htmlEscape(value)}</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderAttachmentRows(
  attachments: TopicAnnouncementEmailAttachmentSummary[]
) {
  if (attachments.length === 0) return '';

  return `
    <div style="margin-top:22px;border:1px solid #dbe4ef;border-radius:12px;background:#f8fafc;padding:14px 16px">
      <p style="margin:0 0 10px 0;color:#334155;font-size:13px;line-height:18px;font-weight:700">Attachments</p>
      ${attachments
        .map(
          (attachment) => `
            <div style="margin-top:8px;border-top:1px solid #e2e8f0;padding-top:8px">
              <p style="margin:0;color:#111827;font-size:14px;line-height:20px;font-weight:600">${htmlEscape(normalizeTopicAnnouncementAttachmentFileName(attachment.fileName))}</p>
              <p style="margin:2px 0 0 0;color:#64748b;font-size:12px;line-height:18px">${htmlEscape(formatBytes(attachment.sizeBytes))}${attachment.contentType ? ` &middot; ${htmlEscape(attachment.contentType)}` : ''}</p>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

export function renderTopicAnnouncementEmail({
  announcement,
  attachments = [],
  workspaceName,
}: {
  announcement: {
    body?: string | null;
    class_label?: string | null;
    day_label?: string | null;
    end_time?: string | null;
    place?: string | null;
    room?: string | null;
    session_date?: string | null;
    start_time?: string | null;
    title: string;
    topic: string;
  };
  attachments?: TopicAnnouncementEmailAttachmentSummary[];
  workspaceName: string | null;
}) {
  const details = [
    ['Class', announcement.class_label],
    ['Date', announcement.session_date],
    ['Day', announcement.day_label],
    ['Time', formatTimeRange(announcement.start_time, announcement.end_time)],
    ['Room', announcement.room],
    ['Place', announcement.place],
  ].filter(([, value]) => Boolean(value)) as [string, string][];
  const detailText = details
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
  const body = announcement.body || announcement.topic;
  const safeWorkspaceName = workspaceName || 'your workspace team';
  const safetyNotice =
    'This message and any attachments were added by a member of the workspace whose emails you verified. They may contain spam or unexpected content. Tuturuuu has not scanned this email or its attachments, so only proceed at your own risk.';
  const attachmentText = attachments
    .map(
      (attachment) =>
        `- ${normalizeTopicAnnouncementAttachmentFileName(attachment.fileName)} (${formatBytes(attachment.sizeBytes)})`
    )
    .join('\n');

  return {
    html: `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${htmlEscape(announcement.title)}</title>
  </head>
  <body style="margin:0;background:#f3f4f6;padding:0;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0">
      ${htmlEscape(body).slice(0, 120)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f4f6">
      <tbody>
        <tr>
          <td align="center" style="padding:28px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:collapse">
              <tbody>
                <tr>
                  <td style="padding:0 0 14px 0">
                    <h1 style="margin:0;color:#0f172a;font-size:28px;line-height:34px;font-weight:800">${htmlEscape(announcement.title)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="overflow:hidden;border:1px solid #e5e7eb;border-radius:18px;background:#ffffff">
                    <div style="border-top:5px solid #2563eb;padding:26px 28px 28px 28px">
                      <p style="margin:0 0 14px 0;color:#475569;font-size:14px;line-height:22px">Hello,</p>
                      ${renderMessageHtml(body)}
                      ${renderDetailRows(details)}
                      ${renderAttachmentRows(attachments)}
                    </div>
                    <div style="border-top:1px solid #e5e7eb;background:#f8fafc;padding:18px 28px">
                      <p style="margin:0;color:#475569;font-size:13px;line-height:20px">Sent by <strong style="color:#0f172a">${htmlEscape(safeWorkspaceName)}</strong>.</p>
                      <p style="margin:6px 0 0 0;color:#94a3b8;font-size:12px;line-height:18px">${htmlEscape(safetyNotice)}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
    subject: announcement.title,
    text: `Hello,\n\n${body}\n\n${detailText ? `${detailText}\n\n` : ''}${attachmentText ? `Attachments:\n${attachmentText}\n\n` : ''}Sent by ${safeWorkspaceName}.\n\n${safetyNotice}`,
  };
}

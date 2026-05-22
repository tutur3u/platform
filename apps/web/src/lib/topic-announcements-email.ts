export function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderTopicAnnouncementEmail({
  announcement,
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
  workspaceName: string | null;
}) {
  const details = [
    ['Class', announcement.class_label],
    ['Date', announcement.session_date],
    ['Day', announcement.day_label],
    [
      'Time',
      [announcement.start_time, announcement.end_time]
        .filter(Boolean)
        .join(' - '),
    ],
    ['Room', announcement.room],
    ['Place', announcement.place],
  ].filter(([, value]) => Boolean(value));
  const detailHtml = details
    .map(
      ([label, value]) =>
        `<li><strong>${htmlEscape(label ?? '')}:</strong> ${htmlEscape(value ?? '')}</li>`
    )
    .join('');
  const detailText = details
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
  const body = announcement.body || announcement.topic;

  return {
    html: `<p>Hello,</p><p>${htmlEscape(body).replaceAll('\n', '<br />')}</p>${detailHtml ? `<ul>${detailHtml}</ul>` : ''}<p>Sent by ${htmlEscape(workspaceName || 'Tuturuuu')}</p>`,
    subject: announcement.title,
    text: `Hello,\n\n${body}\n\n${detailText ? `${detailText}\n\n` : ''}Sent by ${workspaceName || 'Tuturuuu'}`,
  };
}

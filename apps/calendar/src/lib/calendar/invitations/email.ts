import type { InvitationKind, InvitationSnapshot } from './snapshot';

export type InvitationLocale = 'en' | 'vi';

export interface InvitationEmailLinks {
  /** RSVP confirmation page; the response is appended as a query param. */
  rsvpUrl: string | null;
  unsubscribeUrl: string | null;
  blockSenderUrl: string | null;
}

const COPY = {
  en: {
    subject: {
      invite: 'Invitation',
      update: 'Updated invitation',
      cancel: 'Cancelled event',
    },
    intro: {
      invite: '{name} invited you to an event.',
      update: '{name} updated an event you were invited to.',
      cancel: '{name} cancelled this event.',
    },
    when: 'When',
    where: 'Where',
    join: 'Join with Tuturuuu Meet',
    guests: 'Guests',
    organizer: 'organizer',
    optional: 'optional',
    going: 'Going?',
    yes: 'Yes',
    maybe: 'Maybe',
    no: 'No',
    allDay: 'All day',
    footer:
      'Invitation from {name} through Tuturuuu Calendar. You are receiving this because {name} added {email} as a guest.',
    unsubscribe: 'Stop all Tuturuuu calendar invitations',
    block: 'Block invitations from {name}',
    noTitle: '(No title)',
  },
  vi: {
    subject: {
      invite: 'Lời mời',
      update: 'Lời mời đã cập nhật',
      cancel: 'Sự kiện đã huỷ',
    },
    intro: {
      invite: '{name} đã mời bạn tham gia một sự kiện.',
      update: '{name} đã cập nhật một sự kiện bạn được mời.',
      cancel: '{name} đã huỷ sự kiện này.',
    },
    when: 'Thời gian',
    where: 'Địa điểm',
    join: 'Tham gia bằng Tuturuuu Meet',
    guests: 'Khách mời',
    organizer: 'người tổ chức',
    optional: 'không bắt buộc',
    going: 'Bạn sẽ tham gia?',
    yes: 'Có',
    maybe: 'Có thể',
    no: 'Không',
    allDay: 'Cả ngày',
    footer:
      'Lời mời từ {name} qua Tuturuuu Calendar. Bạn nhận được email này vì {name} đã thêm {email} làm khách mời.',
    unsubscribe: 'Ngừng nhận mọi lời mời lịch từ Tuturuuu',
    block: 'Chặn lời mời từ {name}',
    noTitle: '(Không có tiêu đề)',
  },
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

/** Header-safe single line: no CR/LF, bounded length. */
export function sanitizeSubject(value: string) {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function formatInvitationWhen(
  snapshot: Pick<InvitationSnapshot, 'start' | 'end' | 'allDay' | 'timeZone'>,
  locale: InvitationLocale
) {
  const timeZone = snapshot.timeZone || 'UTC';
  const tag = locale === 'vi' ? 'vi-VN' : 'en-US';
  const start = new Date(snapshot.start);
  const end = new Date(snapshot.end);
  let safeZone = timeZone;
  try {
    new Intl.DateTimeFormat(tag, { timeZone });
  } catch {
    safeZone = 'UTC';
  }
  if (snapshot.allDay) {
    const day = new Intl.DateTimeFormat(tag, {
      dateStyle: 'full',
      timeZone: 'UTC',
    });
    return `${day.format(start)} · ${COPY[locale].allDay}`;
  }
  const date = new Intl.DateTimeFormat(tag, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: safeZone,
  });
  const time = new Intl.DateTimeFormat(tag, {
    timeStyle: 'short',
    timeZone: safeZone,
  });
  return `${date.format(start)} – ${time.format(end)} (${safeZone})`;
}

export function buildInvitationSubject(
  snapshot: InvitationSnapshot,
  kind: InvitationKind,
  locale: InvitationLocale
) {
  const copy = COPY[locale];
  const title = snapshot.title.trim() || copy.noTitle;
  return sanitizeSubject(
    `${copy.subject[kind]}: ${title} @ ${formatInvitationWhen(snapshot, locale)}`
  );
}

function button(href: string, label: string, primary = false) {
  const style = primary
    ? 'background:#1a73e8;color:#ffffff;border:1px solid #1a73e8;'
    : 'background:#ffffff;color:#1f2937;border:1px solid #d1d5db;';
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 16px;margin:0 8px 8px 0;border-radius:6px;text-decoration:none;font-weight:600;${style}">${escapeHtml(label)}</a>`;
}

export function buildInvitationEmail(input: {
  snapshot: InvitationSnapshot;
  kind: InvitationKind;
  locale: InvitationLocale;
  recipientEmail: string;
  attendees: InvitationSnapshot['attendees'];
  links: InvitationEmailLinks;
}) {
  const { snapshot, kind, locale, recipientEmail, attendees, links } = input;
  const copy = COPY[locale];
  const organizerName =
    snapshot.organizer.name?.trim() || snapshot.organizer.email;
  const title = snapshot.title.trim() || copy.noTitle;
  const when = formatInvitationWhen(snapshot, locale);
  const where = snapshot.location?.trim() || null;
  const cancelled = kind === 'cancel';

  const rsvp = (response: string) =>
    links.rsvpUrl ? `${links.rsvpUrl}&response=${response}` : null;

  const guestItems = attendees
    .map((attendee) => {
      const label = attendee.name?.trim()
        ? `${attendee.name.trim()} <${attendee.email}>`
        : attendee.email;
      const tags = [
        attendee.email === snapshot.organizer.email ? copy.organizer : null,
        attendee.optional ? copy.optional : null,
      ].filter(Boolean);
      return `<li>${escapeHtml(label)}${
        tags.length
          ? ` <span style="color:#6b7280">(${escapeHtml(tags.join(', '))})</span>`
          : ''
      }</li>`;
    })
    .join('');

  const description = snapshot.description?.trim();
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px"><tr><td style="padding:24px">
<p style="margin:0 0 12px;color:#4b5563">${escapeHtml(fill(copy.intro[kind], { name: organizerName }))}</p>
<h1 style="margin:0 0 16px;font-size:20px;${cancelled ? 'text-decoration:line-through;' : ''}">${escapeHtml(title)}</h1>
<p style="margin:0 0 8px"><strong>${escapeHtml(copy.when)}:</strong> ${escapeHtml(when)}</p>
${where ? `<p style="margin:0 0 8px"><strong>${escapeHtml(copy.where)}:</strong> ${escapeHtml(where)}</p>` : ''}
${!cancelled && snapshot.conferenceUrl ? `<p style="margin:16px 0">${button(snapshot.conferenceUrl, copy.join, true)}<br><span style="color:#6b7280;font-size:12px">${escapeHtml(snapshot.conferenceUrl)}</span></p>` : ''}
${description ? `<p style="margin:16px 0;white-space:pre-wrap">${escapeHtml(description)}</p>` : ''}
${guestItems ? `<p style="margin:16px 0 4px"><strong>${escapeHtml(copy.guests)}</strong></p><ul style="margin:0 0 16px;padding-left:20px">${guestItems}</ul>` : ''}
${!cancelled && links.rsvpUrl ? `<p style="margin:16px 0 8px"><strong>${escapeHtml(copy.going)}</strong></p><p style="margin:0">${button(rsvp('accepted') ?? '', copy.yes)}${button(rsvp('tentative') ?? '', copy.maybe)}${button(rsvp('declined') ?? '', copy.no)}</p>` : ''}
</td></tr></table>
<p style="max-width:600px;margin:16px auto 0;font-size:12px;color:#6b7280">${escapeHtml(fill(copy.footer, { name: organizerName, email: recipientEmail }))}<br>
${[
  links.blockSenderUrl
    ? `<a href="${escapeHtml(links.blockSenderUrl)}" style="color:#6b7280">${escapeHtml(fill(copy.block, { name: organizerName }))}</a>`
    : null,
  links.unsubscribeUrl
    ? `<a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#6b7280">${escapeHtml(copy.unsubscribe)}</a>`
    : null,
]
  .filter(Boolean)
  .join(' · ')}</p>
</body></html>`;

  const text = [
    fill(copy.intro[kind], { name: organizerName }),
    '',
    title,
    `${copy.when}: ${when}`,
    where ? `${copy.where}: ${where}` : null,
    !cancelled && snapshot.conferenceUrl
      ? `${copy.join}: ${snapshot.conferenceUrl}`
      : null,
    description ? `\n${description}` : null,
    !cancelled && links.rsvpUrl
      ? `\n${copy.going} ${copy.yes}: ${rsvp('accepted')}\n${copy.maybe}: ${rsvp('tentative')}\n${copy.no}: ${rsvp('declined')}`
      : null,
    '',
    fill(copy.footer, { name: organizerName, email: recipientEmail }),
    links.blockSenderUrl
      ? `${fill(copy.block, { name: organizerName })}: ${links.blockSenderUrl}`
      : null,
    links.unsubscribeUrl
      ? `${copy.unsubscribe}: ${links.unsubscribeUrl}`
      : null,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    subject: buildInvitationSubject(snapshot, kind, locale),
    html,
    text,
  };
}

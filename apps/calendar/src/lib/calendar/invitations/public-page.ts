import {
  escapeHtml,
  formatInvitationWhen,
  type InvitationLocale,
} from './email';

const COPY = {
  en: {
    rsvpTitle: 'Respond to invitation',
    going: 'Going?',
    yes: 'Yes',
    maybe: 'Maybe',
    no: 'No',
    from: 'From {name}',
    saved: 'Your response was saved: {response}.',
    accepted: 'Yes',
    tentative: 'Maybe',
    declined: 'No',
    invalid: 'This link is invalid or has expired.',
    limited: 'Too many requests. Try again in a minute.',
    unsubscribeTitle: 'Calendar invitation emails',
    unsubscribeAll: 'Stop all Tuturuuu calendar invitations to {email}',
    blockSender: 'Block invitations from {name}',
    unsubscribed: 'Done. {email} will no longer receive these invitations.',
    blocked:
      'Done. {email} will no longer receive invitations from this organizer.',
  },
  vi: {
    rsvpTitle: 'Phản hồi lời mời',
    going: 'Bạn sẽ tham gia?',
    yes: 'Có',
    maybe: 'Có thể',
    no: 'Không',
    from: 'Từ {name}',
    saved: 'Đã lưu phản hồi của bạn: {response}.',
    accepted: 'Có',
    tentative: 'Có thể',
    declined: 'Không',
    invalid: 'Liên kết không hợp lệ hoặc đã hết hạn.',
    limited: 'Quá nhiều yêu cầu. Vui lòng thử lại sau một phút.',
    unsubscribeTitle: 'Email lời mời lịch',
    unsubscribeAll: 'Ngừng gửi mọi lời mời lịch từ Tuturuuu tới {email}',
    blockSender: 'Chặn lời mời từ {name}',
    unsubscribed: 'Xong. {email} sẽ không nhận các lời mời này nữa.',
    blocked: 'Xong. {email} sẽ không nhận lời mời từ người tổ chức này nữa.',
  },
} as const;

export type PublicPageCopy = Record<keyof (typeof COPY)['en'], string>;

export function publicPageLocale(request: Request): InvitationLocale {
  const header = request.headers.get('accept-language') ?? '';
  return /^\s*vi\b/i.test(header) ? 'vi' : 'en';
}

export function publicCopy(locale: InvitationLocale): PublicPageCopy {
  return COPY[locale];
}

export function fillCopy(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    escapeHtml(values[key] ?? '')
  );
}

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** `body` must already be escaped HTML. */
export function renderPublicPage(input: {
  locale: InvitationLocale;
  title: string;
  body: string;
  status?: number;
}) {
  const html = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(input.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f9fafb;--card:#ffffff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--accent:#1a73e8}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f17;--card:#111827;--text:#f3f4f6;--muted:#9ca3af;--line:#1f2937;--accent:#8ab4f8}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:520px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 12px}.muted{color:var(--muted)}
form{display:inline}button{font:inherit;font-weight:600;padding:8px 16px;margin:0 8px 8px 0;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
</style></head><body><main>${input.body}</main></body></html>`;
  return new Response(html, {
    status: input.status ?? 200,
    headers: PAGE_HEADERS,
  });
}

export function eventSummaryHtml(
  event: {
    title: string;
    start: string;
    end: string;
    organizer: string;
  } | null,
  locale: InvitationLocale
) {
  if (!event) return '';
  const copy = COPY[locale];
  const when = formatInvitationWhen(
    { start: event.start, end: event.end, allDay: false, timeZone: null },
    locale
  );
  return `<h1>${escapeHtml(event.title || '-')}</h1><p class="muted">${escapeHtml(when)}</p><p class="muted">${fillCopy(copy.from, { name: event.organizer })}</p>`;
}

export function hiddenField(name: string, value: string) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

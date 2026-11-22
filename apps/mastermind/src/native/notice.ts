import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

/**
 * Worker-rendered pages for a request the Worker refuses during a browser
 * navigation: each says what happened and offers the one step that fixes it,
 * in the locale of the path the person was opening. Other requests keep a
 * plain 403.
 */
export type NoticeKind = 'signInFailed' | 'wrongAccount' | 'mfa';

type Locale = 'en' | 'vi';
const bundles = { en: en.command.notice, vi: vi.command.notice } as const;

/** `/vi` and `/vi/...` are Vietnamese; every other path is English. */
export function pathLocale(path: string): Locale {
  return /^\/vi(?:[/?#]|$)/.test(path) ? 'vi' : 'en';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * A no-script 403 page. `actionHref` is a same-host path the Worker built
 * from a value it already validated.
 */
export function noticePage(
  kind: NoticeKind,
  path: string,
  actionHref: string,
  headers: HeadersInit = {}
) {
  const locale = pathLocale(path);
  const text = bundles[locale][kind];
  const body = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(text.title)} · Mastermind</title></head>
<body>
<main>
<h1>${escapeHtml(text.title)}</h1>
<p>${escapeHtml(text.body)}</p>
<p><a href="${escapeHtml(actionHref)}">${escapeHtml(text.action)}</a></p>
</main>
</body>
</html>
`;
  const response = new Response(body, { status: 403, headers });
  response.headers.set('Content-Type', 'text/html; charset=utf-8');
  return response;
}

/** The Worker's `/login` for `next`, with optional sign-in parameters. */
export function workerLoginHref(
  next: string,
  params: Record<string, string> = {}
) {
  return `/login?${new URLSearchParams({ ...params, nextUrl: next })}`;
}

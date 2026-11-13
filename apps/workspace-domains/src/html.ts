import type { ResolvedWorkspace } from './resolve';

/**
 * Pages are server-rendered without scripts. Inline styles are allowed for
 * the shared stylesheet and CMS Section blocks; frames only for the CMS embed
 * allowlist (YouTube nocookie, Vimeo, Google Maps).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' https: data:",
  "style-src 'unsafe-inline'",
  "font-src 'none'",
  "script-src 'none'",
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com',
].join('; ');

export function securityHeaders(contentType: string): Headers {
  return new Headers({
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'Content-Type': contentType,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
}

export const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
export const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
export const POWERED_BY_URL = 'https://tuturuuu.com';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const BASE_STYLES = `
:root{color-scheme:light dark;--fg:#111;--muted-fg:#555;--bg:#fff;--border:#e5e5e5;--cms-muted:#f5f5f5;--cms-accent:#eef2ff}
@media (prefers-color-scheme:dark){:root{--fg:#f5f5f5;--muted-fg:#a3a3a3;--bg:#0a0a0a;--border:#262626;--cms-muted:#171717;--cms-accent:#1e1b4b}}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;color:var(--fg);background:var(--bg)}
a{color:inherit}
img{max-width:100%;height:auto}
.site{max-width:64rem;margin:0 auto;padding:2rem 1rem 4rem}
.site-footer{margin-top:4rem;padding-top:1rem;border-top:1px solid var(--border);font-size:.875rem;color:var(--muted-fg)}
.cms-button{display:inline-block;padding:.5rem 1rem;border:1px solid currentColor;border-radius:.5rem;text-decoration:none}
.cms-card-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.cms-card{border:1px solid var(--border);border-radius:.75rem;padding:1rem}
.cms-two-column{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))}
.landing{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem 1rem;text-align:center}
.landing img{width:96px;height:96px;border-radius:50%;object-fit:cover}
.landing h1{margin:0;font-size:2rem}
.landing p{margin:0;color:var(--muted-fg);font-size:.875rem}
`;

export function landingPageHtml(workspace: ResolvedWorkspace): string {
  const name = escapeHtml(workspace.name);
  const avatar = workspace.avatarUrl
    ? `<img alt="" src="${escapeHtml(workspace.avatarUrl)}" width="96" height="96">`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
<main class="landing">
${avatar}
<h1>${name}</h1>
<p>Powered by <a href="${POWERED_BY_URL}" rel="noopener">Tuturuuu</a></p>
</main>
</body>
</html>`;
}

export function notFoundHtml(title = 'Not found'): string {
  const safe = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${safe}</title>
<style>${BASE_STYLES}</style>
</head>
<body><main class="landing"><h1>404</h1><p>${safe}</p></main></body>
</html>`;
}

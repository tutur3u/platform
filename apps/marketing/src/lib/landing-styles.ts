/** Keep serialized RSC resource identities consistent with the document head. */
export function landingStyles(
  html: string,
  mapping: Record<string, { critical: string; remaining: string }>
) {
  let result = html;
  for (const [full, { critical, remaining }] of Object.entries(mapping)) {
    result = result.replaceAll(full, critical);
    const mount = html.includes(`/marketing${full}`) ? '/marketing' : '';
    result = result.replace(
      '</head>',
      `<link rel="stylesheet" media="print" fetchpriority="low" data-landing-complete="" data-href="${mount}${remaining}"><noscript><link rel="stylesheet" href="${mount}${full}"></noscript></head>`
    );
  }
  // Module dependencies load from the normal entry after critical visual assets.
  // The server-rendered links and poster work before hydration.
  return result
    .replace(/<link\b[^>]*rel="modulepreload"[^>]*\/?>(?:<\/link>)?/gu, '')
    .replace(
      /<script\b([^>]*type="module"[^>]*)>/gu,
      '<script fetchpriority="low"$1>'
    );
}

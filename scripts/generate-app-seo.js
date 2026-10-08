const fs = require('node:fs');
const path = require('node:path');
const policy = require('../packages/utils/src/seo-policy.json');

const ROOT = path.resolve(__dirname, '..');

function escapeXml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]
  );
}

function localizedUrl(origin, pathname, locale, localePrefix) {
  const prefix = localePrefix === 'as-needed' && locale === 'vi' ? '/vi' : '';
  return new URL(`${prefix}${pathname ? `/${pathname}` : ''}` || '/', origin)
    .href;
}

function sitemap(config) {
  const locales = config.localePrefix === 'never' ? ['en'] : ['en', 'vi'];
  const entries = config.publicPaths.flatMap((pathname) =>
    locales.map((locale) => {
      const url = localizedUrl(
        config.origin,
        pathname,
        locale,
        config.localePrefix
      );
      const alternates =
        locales.length === 1
          ? ''
          : `${['en', 'vi', 'x-default']
              .map(
                (language) =>
                  `    <xhtml:link rel="alternate" hreflang="${language}" href="${escapeXml(localizedUrl(config.origin, pathname, language === 'vi' ? 'vi' : 'en', config.localePrefix))}" />`
              )
              .join('\n')}\n`;
      return `  <url>\n    <loc>${escapeXml(url)}</loc>\n${alternates}  </url>`;
    })
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

function outputs() {
  const files = new Map();
  for (const [app, config] of Object.entries(policy)) {
    // The platform uses its publication-aware Next metadata routes.
    if (app === 'web') continue;
    const base = `apps/${app}/public`;
    const sitemapLine = config.publicPaths.length
      ? `\nSitemap: ${config.origin}/sitemap.xml\n`
      : '';
    files.set(`${base}/robots.txt`, `User-agent: *\nAllow: /\n${sitemapLine}`);
    if (config.publicPaths.length)
      files.set(`${base}/sitemap.xml`, sitemap(config));
  }
  return files;
}

function generate({ check = false, root = ROOT } = {}) {
  const stale = [];
  for (const [file, source] of outputs()) {
    const target = path.join(root, file);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === source)
      continue;
    stale.push(file);
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
  }
  if (check && stale.length)
    throw new Error(`Stale app SEO assets:\n${stale.join('\n')}`);
  return stale;
}

module.exports = { generate, localizedUrl, outputs, sitemap };
if (require.main === module) {
  const changed = generate({ check: process.argv.includes('--check') });
  console.log(
    `App SEO assets: ${changed.length} ${process.argv.includes('--check') ? 'stale' : 'updated'}`
  );
}

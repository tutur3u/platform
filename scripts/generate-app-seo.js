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

function hasWhitespaceOrControl(value) {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0);
    return /\s/u.test(character) || code < 32 || code === 127;
  });
}

function validateConfig(app, config) {
  const origin = new URL(config.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    config.origin !== origin.origin
  )
    throw new Error(`Invalid canonical origin for ${app}`);
  if (!['never', 'as-needed'].includes(config.localePrefix))
    throw new Error(`Invalid locale policy for ${app}`);
  const seen = new Set();
  const urls = new Set();
  const locales = config.localePrefix === 'never' ? ['en'] : ['en', 'vi'];
  const privatePath =
    /(?:^|\/)(?:api|auth|login|logout|signup|verify-token|auth-error|add-account|dashboard|onboarding|invite|shared|share|embed|orders|cart|checkout|account|no-access|access-denied|not-whitelisted|not-available|-)(?:\/|$)/;
  for (const pathname of config.publicPaths) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new Error(
        `Invalid public sitemap encoding for ${app}: ${pathname}`
      );
    }
    if (
      typeof pathname !== 'string' ||
      hasWhitespaceOrControl(pathname) ||
      hasWhitespaceOrControl(decoded) ||
      decoded.startsWith('/') ||
      (pathname.endsWith('/') && pathname !== '') ||
      /[?#\\]/.test(decoded) ||
      decoded
        .split('/')
        .some((segment) => segment === '.' || segment === '..') ||
      privatePath.test(decoded) ||
      seen.has(pathname)
    )
      throw new Error(
        `Invalid or duplicate public sitemap path for ${app}: ${pathname}`
      );
    seen.add(pathname);
    for (const locale of locales) {
      const url = localizedUrl(
        config.origin,
        pathname,
        locale,
        config.localePrefix
      );
      if (
        privatePath.test(decodeURIComponent(new URL(url).pathname)) ||
        url.length > 2048 ||
        urls.has(url)
      )
        throw new Error(
          `Invalid or duplicate localized sitemap URL for ${app}: ${url}`
        );
      urls.add(url);
    }
  }
  if (urls.size > 50000)
    throw new Error(`Sitemap capacity exceeded for ${app}; split the sitemap`);
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
    validateConfig(app, config);
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
  const expected = outputs();
  for (const [file, source] of expected) {
    const target = path.join(root, file);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === source)
      continue;
    stale.push(file);
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
  }
  // A private app must not retain an old public sitemap when its policy changes.
  // Only this generator's exact static sitemap paths are owned here.
  for (const app of Object.keys(policy)) {
    const file = `apps/${app}/public/sitemap.xml`;
    if (expected.has(file) || !fs.existsSync(path.join(root, file))) continue;
    stale.push(file);
    if (!check) fs.unlinkSync(path.join(root, file));
  }
  if (check && stale.length)
    throw new Error(`Stale app SEO assets:\n${stale.join('\n')}`);
  return stale;
}

module.exports = { generate, localizedUrl, outputs, sitemap, validateConfig };
if (require.main === module) {
  const changed = generate({ check: process.argv.includes('--check') });
  console.log(
    `App SEO assets: ${changed.length} ${process.argv.includes('--check') ? 'stale' : 'updated'}`
  );
}

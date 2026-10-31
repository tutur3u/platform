const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.mintlify'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function navigationPages(value, insidePages = false, result = []) {
  if (typeof value === 'string' && insidePages) result.push(value);
  else if (Array.isArray(value))
    for (const item of value) navigationPages(item, insidePages, result);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value))
      navigationPages(item, key === 'pages', result);
  return result;
}

// Public docs must never name internal registers, hosts, paths, secrets,
// accounts, agent threads or customers without consent. Messages carry the
// rule and location only, so CI logs never repeat the matched text. Rules run
// over the whole source (not line by line) so a name wrapped across a line
// break is still found.
const PUBLIC_SAFETY_RULES = [
  ['internal security register ID', /\bSR-\d{2,4}[a-z]?\b/],
  [
    'developer home-directory path',
    /(?<![\w\][)}./-])\/(?:Users|home)\/(?!runner\b|user\b)[A-Za-z][\w.-]*\//,
  ],
  ['fleet host or machine name', /\b(?:skr-[a-z0-9-]+|sokora[\w-]*)\b/i],
  [
    'fleet host or machine name',
    /\b(?:Sonha|ThanhStudio)\b|\bThanh\b(?! toan\b)/,
  ],
  ['tailnet hostname', /\.ts\.net\b/],
  [
    'tailnet address',
    /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/,
  ],
  [
    'Cloudflare account workers.dev host',
    /\b[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.workers\.dev\b/i,
  ],
  [
    'private network address',
    /\b(?:192\.168|10\.(?!0\.2\.2\b)\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/,
  ],
  [
    'token-shaped secret',
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16}|xox[bap]-[A-Za-z0-9-]{10,}|sbp_[a-z0-9]{30,})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ],
  ['JWT-shaped token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ/],
  [
    'Supabase project reference',
    /\b[a-z]{20}\.supabase\.(?:co|in)\b|\b(?:nzamlzqfdwaaxdefwraj|fxefojytwimjiqxseqag)\b/,
  ],
  ['agent or thread identifier', /\bmcp:(?:launch:|[0-9a-f]{8}-)/],
  [
    'customer name without consent',
    /\b(?:Easy[\s_-]*Center|phongkhamtinhmach|bacsivy|buouco|lomnguc|PKTM)\b/i,
  ],
  ['personal or staff email address', /[\w.+-]+@gmail\.com\b|\bphucvo@/i],
];

// Extra rules for anything readable on the public docs site or shipped as
// public plugin guidance (apps/docs and plugins/**). docs-internal/ may name
// staging hosts; the public surfaces may not. Justified exceptions go in
// scripts/docs-safety-allowlist.json as {path, rule, reason}.
const PUBLIC_ONLY_SAFETY_RULES = [
  [
    'staging host',
    /\b[a-z0-9][a-z0-9-]*(?:\.staging\.tutur3u\.com|-staging\.tutur3u\.com)\b/,
  ],
  ['staging worker name', /\btuturuuu-[a-z0-9-]*staging[a-z0-9-]*\b/],
  [
    'bypass secret name',
    /\b[A-Z0-9_]*(?:AUTOMATION_BYPASS|BYPASS_SECRET|AUTH_BYPASS|PROTECTION_BYPASS)[A-Z0-9_]*\b/,
  ],
  ['workers.dev hostname', /\b[a-z0-9][a-z0-9-]*\.workers\.dev\b/],
];

const ALLOWLIST_FILE = 'scripts/docs-safety-allowlist.json';

function loadSafetyAllowlist(root) {
  const file = path.join(root, ALLOWLIST_FILE);
  const allowed = new Set();
  const errors = [];
  if (!fs.existsSync(file)) return { allowed, errors };
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf8')).entries;
  } catch {
    return { allowed, errors: [`Invalid allowlist file: ${ALLOWLIST_FILE}`] };
  }
  for (const entry of entries ?? []) {
    if (!entry?.path || !entry?.rule || !String(entry?.reason ?? '').trim())
      errors.push(
        `Invalid allowlist entry (needs path, rule, reason): ${ALLOWLIST_FILE}`
      );
    else allowed.add(`${entry.path}|${entry.rule}`);
  }
  return { allowed, errors };
}

function publicSafetyErrors(
  source,
  relative,
  {
    rules = PUBLIC_SAFETY_RULES,
    allowed = new Set(),
    allowPath = relative,
  } = {}
) {
  const errors = [];
  for (const [label, pattern] of rules) {
    if (allowed.has(`${allowPath}|${label}`)) continue;
    const lines = new Set();
    for (const match of source.matchAll(
      new RegExp(pattern.source, `${pattern.flags}g`)
    ))
      lines.add(source.slice(0, match.index).split('\n').length);
    for (const line of lines)
      errors.push(`Public-safety (${label}): ${relative}:${line}`);
  }
  return errors;
}

function audit(root = ROOT) {
  const docs = path.join(root, 'apps/docs');
  const config = JSON.parse(
    fs.readFileSync(path.join(docs, 'docs.json'), 'utf8')
  );
  const pages = navigationPages(config.navigation);
  const registered = new Set(pages);
  const redirects = new Set(
    (config.redirects ?? []).map((entry) => entry.source.replace(/^\//, ''))
  );
  const safetyAllowlist = loadSafetyAllowlist(root);
  const errors = [...safetyAllowlist.errors];
  const files = walk(docs).filter((file) => file.endsWith('.mdx'));
  // docs-internal/ is hidden from the site but still public on GitHub, so it
  // gets the same public-safety scan (not the navigation or link checks).
  const internalRoot = path.join(root, 'docs-internal');
  if (fs.existsSync(internalRoot))
    for (const file of walk(internalRoot).filter((f) => /\.mdx?$/.test(f)))
      errors.push(
        ...publicSafetyErrors(
          fs.readFileSync(file, 'utf8'),
          path.relative(root, file).split(path.sep).join('/')
        )
      );
  const exists = (slug) =>
    ['.mdx', '.md'].some((extension) =>
      fs.existsSync(path.join(docs, slug + extension))
    );
  const pluginsRoot = path.join(root, 'plugins');
  if (fs.existsSync(pluginsRoot))
    for (const file of walk(pluginsRoot).filter((f) => /\.mdx?$/.test(f)))
      errors.push(
        ...publicSafetyErrors(
          fs.readFileSync(file, 'utf8'),
          path.relative(root, file).split(path.sep).join('/'),
          {
            rules: PUBLIC_ONLY_SAFETY_RULES,
            allowed: safetyAllowlist.allowed,
          }
        )
      );
  for (const slug of pages)
    if (!exists(slug)) errors.push(`Missing navigation page: ${slug}`);
  for (const slug of pages)
    if (pages.indexOf(slug) !== pages.lastIndexOf(slug))
      errors.push(`Duplicate navigation page: ${slug}`);
  for (const file of files) {
    const relative = path.relative(docs, file).split(path.sep).join('/');
    const slug = relative.slice(0, -4);
    const source = fs.readFileSync(file, 'utf8');
    errors.push(
      ...publicSafetyErrors(source, relative, {
        rules: [...PUBLIC_SAFETY_RULES, ...PUBLIC_ONLY_SAFETY_RULES],
        allowed: safetyAllowlist.allowed,
        allowPath: `apps/docs/${relative}`,
      })
    );
    if (!registered.has(slug) && !redirects.has(slug))
      errors.push(`Unregistered page: ${slug}`);
    if (
      !/^---\r?\n[\s\S]*?^title:\s*.+[\s\S]*?^description:\s*.+[\s\S]*?^---/m.test(
        source
      )
    )
      errors.push(`Missing title/description: ${relative}`);
    // Ignore runnable/example fenced code; internal author links should resolve.
    const content = source
      .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
      .replace(/`[^`\n]*`/g, '');
    const targets = [
      ...[...content.matchAll(/(?<!!)\[[^\]]+\]\(([^\s)]+)/g)].map(
        (match) => match[1]
      ),
      ...[...content.matchAll(/\bhref=["'](\/[^"']+)["']/g)].map(
        (match) => match[1]
      ),
    ];
    for (const target of targets) {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
      const clean = target.split(/[?#]/)[0];
      if (!clean) continue;
      const candidate = clean.startsWith('/')
        ? path.join(docs, clean.slice(1))
        : path.resolve(path.dirname(file), clean);
      const relativeTarget = path
        .relative(docs, candidate)
        .split(path.sep)
        .join('/');
      if (relativeTarget.startsWith('../')) continue; // Source references outside docs.
      if (fs.existsSync(candidate)) continue;
      const pageSlug = relativeTarget
        .replace(/\.(mdx|md)$/, '')
        .replace(/\/$/, '');
      if (!exists(pageSlug) && !redirects.has(pageSlug))
        errors.push(`Broken internal link: ${relative} -> ${target}`);
    }
    for (const image of content.matchAll(
      /(?:!\[[^\]]*\]\(|\bsrc=["'])(\/[^\s)"']+)/g
    )) {
      const target = image[1].split(/[?#]/)[0];
      if (!fs.existsSync(path.join(docs, target.slice(1))))
        errors.push(`Missing asset: ${relative} -> ${target}`);
    }
  }
  for (const entry of config.redirects ?? []) {
    if (entry.source === entry.destination)
      errors.push(`Self redirect: ${entry.source}`);
    if (!exists(entry.destination.replace(/^\//, '')))
      errors.push(`Missing redirect target: ${entry.destination}`);
  }
  return {
    errors: [...new Set(errors)],
    pageCount: files.length,
    navigationCount: registered.size,
  };
}

module.exports = { audit, navigationPages, publicSafetyErrors };
if (require.main === module) {
  const result = audit();
  // The agent operating model page must agree with AGENTS.md and the plugin
  // reference on the shared subagent allocation.
  const { checkRepository } = require('./ci/check-agent-budget.js');
  result.errors.push(...checkRepository().errors);
  console.log(
    `Docs audit: ${result.pageCount} pages, ${result.navigationCount} navigation entries, ${result.errors.length} errors`
  );
  for (const error of result.errors) console.error(error);
  process.exitCode = result.errors.length ? 1 : 0;
}

const crypto = require('node:crypto');
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
  ['Supabase project host', /\b[a-z]{20}\.supabase\.(?:co|in)\b/],
  ['agent or thread identifier', /\bmcp:(?:launch:|[0-9a-f]{8}-)/],
  ['personal email address', /[\w.+-]+@gmail\.com\b/i],
];

// Terms that must not appear in public docs but must not be spelled out in
// this public file either: customer names without consent, internal machine
// names, project references and a staff mailbox prefix. Only salted SHA-256
// hashes of the normalised terms (lowercase letters and digits, words joined)
// live here. A page is checked by hashing every run of 1-3 consecutive words,
// so a term wrapped across lines or joined by dashes is still found. Names are
// guessable, so hashing only keeps the list out of casual search; the real list
// lives in the private internal-docs repository. Add a term with
// `node scripts/ci/docs-safety-hash.js "<term>"` and paste the hash under the
// right label. Messages carry the rule and location only.
const TERM_SALT = 'e6b1b0ab4a648d7bdf07d985';
const HASHED_TERMS = {
  'fleet host or machine name': [
    'ed8148614946d158db8d951c4d3e094968ca0044864953d3645ff65a2b8de71f',
    '4482cd9029faf3b7c9fdac756ccb4aebea4336a605755c58f7eee8adcda36e4d',
    'fb1909bbaa7a678371a5670b9a1d7325357b9a5e07b5d086d2542af60efca06a',
    '36be259a4716d726e1e7ec55a1e769091d3085d0bb187e4d1661b25602eefcc8',
    '0c8e297db2de8e9571c1be2d952504168a7f6646124e07b5be0ca469fee8b010',
  ],
  'Supabase project reference': [
    '58d7d0b620c81632f93139b32efbb1b79b71f6874cc6e3905874ce56952434e3',
    '4d266edcb9a14d9e34bc41fc29e41bdfeabba20ac0a62e8863d28b5968ec4bf2',
  ],
  'customer name without consent': [
    '5678f63af489867caaad8640b250669f1c8428bfaa238855f81c6c0b7dc85d38',
    '003bdad12e7c4bbc509ca5fca852d036bd978dc961a2baa54fea8f82cc3fc716',
    'fb30887a141b4c9f08ef197dc17507f2439ab52fd4f7f3062ecbb6a8590c3eae',
    'f4565f420aa43b8412b3c9b20eb5f6cff36a8459ca2d075418e42bdaf2dc35ac',
    '7636192057da9d1451170afdb02107b2a271c2ceb3e11213183f7172ec928f19',
    '3350e5525f44c24d21e490d6b302b2e9bb76d9e234611e953c013e9105f3c3ac',
  ],
  'personal or staff email address': [
    '517063b9955e61e83f0a04f7249eac2ef890db8a8e1bcac5387294bbab8001d8',
  ],
};
const MAX_TERM_WORDS = 3;

function hashTerm(term, salt = TERM_SALT) {
  const normalised = String(term)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return crypto
    .createHash('sha256')
    .update(`${salt}:${normalised}`)
    .digest('hex');
}

// Labels whose terms also match as the start of a longer single word (machine
// names appear inside hostnames such as `<name>ubuntu`). Prefixes shorter than
// MIN_PREFIX_LENGTH are never tested.
const PREFIX_LABELS = new Set(['fleet host or machine name']);
const MIN_PREFIX_LENGTH = 3;
const MAX_PREFIX_LENGTH = 24;

function hashedTermErrors(
  source,
  relative,
  {
    terms = HASHED_TERMS,
    salt = TERM_SALT,
    allowed = new Set(),
    allowPath = relative,
    prefixLabels = PREFIX_LABELS,
  } = {}
) {
  const lookup = new Map();
  for (const [label, hashes] of Object.entries(terms))
    for (const hash of hashes) lookup.set(hash, label);
  const cache = new Map();
  const labelOf = (text) => {
    if (!cache.has(text)) cache.set(text, lookup.get(hashTerm(text, salt)));
    return cache.get(text);
  };
  const words = [...source.matchAll(/[a-z0-9]+/gi)].map((match) => ({
    text: match[0].toLowerCase(),
    index: match.index,
  }));
  const found = new Map();
  const report = (label, wordIndex) => {
    if (!label || allowed.has(`${allowPath}|${label}`)) return;
    const line = source.slice(0, words[wordIndex].index).split('\n').length;
    found.set(`${label}|${line}`, [label, line]);
  };
  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    for (
      let end = start;
      end < Math.min(words.length, start + MAX_TERM_WORDS);
      end += 1
    ) {
      joined += words[end].text;
      report(labelOf(joined), start);
    }
    const word = words[start].text;
    for (
      let length = MIN_PREFIX_LENGTH;
      length < Math.min(word.length, MAX_PREFIX_LENGTH + 1);
      length += 1
    ) {
      const label = labelOf(word.slice(0, length));
      if (prefixLabels.has(label)) report(label, start);
    }
  }
  return [...found.values()].map(
    ([label, line]) => `Public-safety (${label}): ${relative}:${line}`
  );
}

// Extra rules for anything readable on the public docs site, shipped as public
// plugin guidance, or kept in the public repository's docs-internal/ folder
// (apps/docs, plugins/** and docs-internal/**). Those hide runbooks from the
// site, not from GitHub, so none of them may name staging hosts or credential
// names; detail that needs them lives in the private internal-docs repo.
// Justified exceptions go in
// scripts/docs-safety-allowlist.json as {path, rule, reason}.
const PUBLIC_ONLY_SAFETY_RULES = [
  [
    'staging host',
    /\b(?:web|calendar|contacts|finance|meet|mail|apps)\.tutur3u\.com\b|\b[a-z0-9][a-z0-9-]*(?:\.staging\.tutur3u\.com|-staging\.tutur3u\.com)\b/,
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
    terms = HASHED_TERMS,
    salt = TERM_SALT,
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
  errors.push(
    ...hashedTermErrors(source, relative, { terms, salt, allowed, allowPath })
  );
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
          path.relative(root, file).split(path.sep).join('/'),
          {
            rules: [...PUBLIC_SAFETY_RULES, ...PUBLIC_ONLY_SAFETY_RULES],
            allowed: safetyAllowlist.allowed,
          }
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

module.exports = {
  audit,
  hashTerm,
  hashedTermErrors,
  navigationPages,
  publicSafetyErrors,
};
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

// Content rules for the public store listings: copy quality, App Store keyword
// rules, release-date consistency and the public-data guard. The listings are
// bundled into tuturuuu.com/roadmap, so anything private must live in
// apps/mobile/store/internal instead.

export const LOCALES = ['en', 'vi'];

export const PUBLIC_URL_HOSTS = new Set([
  'tuturuuu.com',
  'apps.apple.com',
  'play.google.com',
  'apps.microsoft.com',
]);

// Store review rejects ranking claims, prices and other products' names.
const FORBIDDEN_TERMS = [
  /\bbest\b/iu,
  /#\s?1\b/u,
  /\bnumber one\b/iu,
  /\btop[- ]rated\b/iu,
  /\bfree\b/iu,
  /tốt nhất/iu,
  /số\s?1\b/iu,
  /miễn phí/iu,
  /[$€£¥₫]\s?\d|\d\s?(usd|vnd|đ)(?!\p{L})/iu,
  /\b(notion|todoist|trello|asana|evernote|clickup|jira|slack|ticktick|chatgpt|gemini|copilot|outlook|google calendar|microsoft to do)\b/iu,
];

const EMOJI = /\p{Extended_Pictographic}/u;

// Matched anywhere in a key, so `packagePublisher` or `reviewerNotes` fail too.
const PRIVATE_KEY =
  /reviewer|credential|password|secret|token|api[-_]?key|internal|^notes?$|ticket|issuer|team[-_]?id|account[-_]?id|key[-_]?id|publisher|package[-_]?(identity|family)|demo[-_]?account/iu;

const PRIVATE_VALUES = [
  { pattern: /\bCN=/u, label: 'certificate subject' },
  {
    pattern:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu,
    label: 'GUID',
  },
  { pattern: /[^\s@]+@[^\s@]+\.[a-z]{2,}/iu, label: 'email address' },
];

const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/giu;

export function* walk(value, at = '$') {
  yield [at, value];
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* walk(item, `${at}[${index}]`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      yield* walk(item, `${at}.${key}`);
    }
  }
}

function* strings(value, at) {
  for (const [path, item] of walk(value, at)) {
    if (typeof item === 'string') yield [path, item];
  }
}

/** User-visible copy: listing fields, screenshot captions and gallery alt text. */
export function checkCopy(listing, errors) {
  const visible = [
    ['$.listing', listing.listing],
    ['$.screenshots', listing.screenshots],
    ['$.gallery', listing.gallery],
  ];
  for (const [root, value] of visible) {
    for (const [at, text] of strings(value ?? {}, root)) {
      if (/\.files\.|\.file$/u.test(at)) continue;
      if (text !== text.normalize('NFC')) {
        errors.push({ path: at, message: 'text must be NFC-normalized' });
      }
      if (EMOJI.test(text)) {
        errors.push({ path: at, message: 'emoji are not allowed in listings' });
      }
      for (const term of FORBIDDEN_TERMS) {
        const match = text.match(term);
        if (match) {
          errors.push({ path: at, message: `forbidden claim "${match[0]}"` });
        }
      }
    }
  }
}

export function checkKeywords(listing, errors) {
  const { keywords, name, nameFallback } = listing.listing ?? {};
  if (!keywords || typeof keywords !== 'object') return;
  for (const locale of LOCALES) {
    const value = keywords[locale];
    if (typeof value !== 'string') continue;
    const at = `$.listing.keywords.${locale}`;
    const nameTokens = new Set(
      [name?.[locale], nameFallback?.[locale]]
        .filter((item) => typeof item === 'string')
        .flatMap((item) => item.toLowerCase().split(/[^\p{L}\p{N}]+/u))
        .filter((token) => token.length > 2)
    );
    const seen = new Set();
    for (const term of value.split(',')) {
      const normalized = term.trim().toLowerCase();
      if (seen.has(normalized)) {
        errors.push({ path: at, message: `duplicate keyword "${term}"` });
      }
      seen.add(normalized);
      if (normalized.includes('tuturuuu')) {
        errors.push({
          path: at,
          message: `keyword repeats the app name: "${term}"`,
        });
      }
    }
    // The name is already indexed; repeating it wastes keyword bytes.
    for (const token of nameTokens) {
      if (token !== 'tuturuuu' && seen.has(token)) {
        errors.push({
          path: at,
          message: `keyword "${token}" repeats the app name`,
        });
      }
    }
  }
}

const STATUS_REQUIRES = {
  submitted: ['submittedAt'],
  in_review: ['submittedAt'],
  approved: ['submittedAt', 'approvedAt'],
  live: ['submittedAt', 'approvedAt', 'liveAt', 'storeUrl'],
};

export function checkRelease(listing, errors) {
  const release = listing.release;
  if (!release || typeof release !== 'object') return;
  const time = (key) => {
    const value = release[key];
    if (typeof value !== 'string') return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      errors.push({
        path: `$.release.${key}`,
        message: 'is not a valid date-time',
      });
      return null;
    }
    return parsed;
  };
  const order = (earlier, later) => {
    const a = time(earlier);
    const b = time(later);
    if (a !== null && b !== null && b < a) {
      errors.push({
        path: `$.release.${later}`,
        message: `precedes ${earlier}`,
      });
    }
  };
  order('targetSubmitDate', 'targetLiveDate');
  order('submittedAt', 'approvedAt');
  order('approvedAt', 'liveAt');
  for (const key of STATUS_REQUIRES[release.status] ?? []) {
    if (release[key] === null || release[key] === undefined) {
      errors.push({
        path: `$.release.${key}`,
        message: `is required once status is "${release.status}"`,
      });
    }
  }
}

/**
 * Keeps private data out of the public files: private-looking keys, ids,
 * emails, non-public URLs, and any value recorded in the internal files.
 */
export function checkPublicData(listing, internalValues, errors) {
  for (const [at, value] of walk(listing)) {
    const key = at.match(/\.([^.[\]]+)$/u)?.[1];
    if (key && key !== '$schema' && PRIVATE_KEY.test(key)) {
      errors.push({ path: at, message: `"${key}" is not public listing data` });
    }
    if (typeof value !== 'string') continue;
    for (const { pattern, label } of PRIVATE_VALUES) {
      if (pattern.test(value)) {
        errors.push({ path: at, message: `contains a ${label}` });
      }
    }
    for (const secret of internalValues) {
      if (value.includes(secret)) {
        errors.push({
          path: at,
          message: 'contains a value from apps/mobile/store/internal',
        });
      }
    }
    for (const url of value.match(URL_IN_TEXT) ?? []) {
      checkUrl(url, at, errors);
    }
  }
}

function checkUrl(url, at, errors) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    errors.push({ path: at, message: `invalid URL ${url}` });
    return;
  }
  if (parsed.protocol !== 'https:') {
    errors.push({ path: at, message: `URL must use https: ${url}` });
  }
  if (!PUBLIC_URL_HOSTS.has(parsed.hostname)) {
    errors.push({
      path: at,
      message: `URL host ${parsed.hostname} is not a public store or tuturuuu.com`,
    });
  }
  if (parsed.username || parsed.password || parsed.search) {
    errors.push({
      path: at,
      message: `URL must not carry credentials or query strings: ${url}`,
    });
  }
}

import { CLIENT_TERM_HASHES } from '../content/title-denylist.ts';
import { INCIDENT_TERMS, PLUMBING_TERMS, termHash } from '../live/feed.ts';

/**
 * Classify any merged PR title, conventional (`feat(tasks): …`) or legacy
 * (`Add sprint planning to boards`), into a public track and a kind.
 * Titles are only ever published for user-facing features in a known public
 * track that pass the incident/security/customer and plumbing filters and the
 * hashed denylist. Everything else is counted, never titled. Client or
 * partner work therefore only appears as anonymous counts.
 */

export type Kind = 'feature' | 'fix' | 'maintenance';

export type Classified = {
  track: string;
  kind: Kind;
  /** Plain public title, or null when the change is only counted. */
  title: string | null;
};

/** The track for counted work that maps to no public product. */
export const OTHER_TRACK = 'other';

/** Conventional-commit scopes → public tracks. */
export const SCOPE_TRACKS: Record<string, string> = {
  tasks: 'tasks',
  'tasks-ui': 'tasks',
  'tasks-api': 'tasks',
  chat: 'chat',
  calendar: 'calendar',
  finance: 'finance',
  'finance-core': 'finance',
  drive: 'drive',
  storage: 'drive',
  mail: 'mail',
  meet: 'meet',
  'meet-core': 'meet',
  notes: 'meet',
  mastermind: 'mastermind',
  mobile: 'mobile',
  mira: 'mira',
  ai: 'mira',
  discord: 'mira',
  zalo: 'mira',
  learn: 'upskii',
  teach: 'upskii',
  upskii: 'upskii',
  rewise: 'upskii',
  education: 'upskii',
  forms: 'forms',
  track: 'track',
  habits: 'track',
  cms: 'cms',
  'cms-blocks': 'cms',
  inventory: 'inventory',
  storefront: 'inventory',
  pay: 'pay',
  payment: 'pay',
  billing: 'pay',
  shortener: 'shortener',
  contacts: 'contacts',
  crm: 'contacts',
  desktop: 'desktop',
  marketing: 'workspace',
  web: 'workspace',
  workspace: 'workspace',
  satellite: 'platform',
  roadmap: 'platform',
  gateway: 'platform',
  i18n: 'workspace',
  ui: 'workspace',
  nova: 'nova',
  lettin: 'tulletin',
  tulletin: 'tulletin',
  colab: 'colab',
  models: 'ai-studio',
  sdk: 'dx',
  docs: 'dx',
  cli: 'dx',
};

/** Legacy titles: first matching keyword wins. Order matters. */
const KEYWORD_TRACKS: [RegExp, string][] = [
  [/\bmira\b|\b(ai|gpt|gemini|llm|chatbot|assistant)\b/i, 'mira'],
  [/\bmastermind\b/i, 'mastermind'],
  [/\b(mobile|ios|android|flutter)\b/i, 'mobile'],
  [/\bcalendar|\bevents?\b|schedul/i, 'calendar'],
  [/\bfinanc|\binvoice|\bwallet|\btransaction|\bbudget|tuition/i, 'finance'],
  [/\btasks?\b|\bboards?\b|kanban|\bsprint|\bcycles?\b/i, 'tasks'],
  [/\bchat\b|\bmessag/i, 'chat'],
  [/\bmail\b|\bemail|\binbox/i, 'mail'],
  [/\bmeet(ing)?s?\b|\btranscri|\bwaiting room/i, 'meet'],
  [/\bdrive\b|\bfiles?\b|\bstorage\b|\bupload/i, 'drive'],
  [
    /\b(learn|teach|course|quiz|lesson|education|upskii|rewise|classroom)/i,
    'upskii',
  ],
  [/\bforms?\b|\bsurvey/i, 'forms'],
  [/\btime ?track|\bhabits?\b/i, 'track'],
  [/\binventory|\bwarehouse|\bstock\b/i, 'inventory'],
  [
    /\bstorefront|\bcheckout|\bsubscription|\bpayments?\b|\bpricing|\bbilling|\binvoic/i,
    'pay',
  ],
  [/\bshort(ener| links?)|ttr\.gg/i, 'shortener'],
  [/\bcontacts?\b|\bcrm\b|\battendance/i, 'contacts'],
  [/\bnova\b|prompt engineering/i, 'nova'],
  [/\bcolab\b/i, 'colab'],
  [/\bcms\b|\bblog|\bposts?\b/i, 'cms'],
  [/\bdesktop\b|\belectron|\btauri/i, 'desktop'],
  [/\b(docs|documentation|sdk|cli)\b/i, 'dx'],
  [
    /\blog ?in\b|sign ?(in|up)|onboard|landing|home ?page|settings|workspaces?\b|locale|translat|i18n|dark mode|theme|navbar|sidebar|profile/i,
    'workspace',
  ],
];

/** Implementation detail that is not a user-facing feature, even if "Add …". */
export const INTERNAL_TERMS =
  /(authori[sz]|authenticat|api[ _-]?keys?|\bkeys?\b|\btables?\b|\bschema|\bsql\b|supabase|database|\bdb\b|\brls\b|row.level|webhook|\bcron\b|\benv\b|internal|_[a-z]+_|\bwip\b|\btests?\b|\bdebug|\blogging|\brefactor|deprecat|\bpolicy|\bpolicies)/i;

const CONVENTIONAL = /^([a-z]+)(?:\(([a-z0-9,.\-/ ]+)\))?!?:\s*(.+)$/i;
const FEATURE_TYPES = new Set(['feat', 'perf']);
const FIX_TYPES = new Set(['fix']);
const LEGACY_FEATURE =
  /^(add|adds|added|implement|introduce|support|enable|create|allow|improve|redesign|revamp|new|show|display|integrate|launch|build|make)\b/i;
const LEGACY_FIX = /^(fix|fixes|fixed|resolve|correct|patch|prevent|handle)\b/i;
const NOISE =
  /^(\[imgbot\]|bump\b|merge\b|release\b|chore\(deps|update dependency|renovate|revert\b|version\b|v\d)/i;

function deniedTerm(text: string, hashes: ReadonlySet<string>) {
  if (!hashes.size) return false;
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    if (hashes.has(termHash(words[i]))) return true;
    if (
      i + 1 < words.length &&
      hashes.has(termHash(`${words[i]} ${words[i + 1]}`))
    )
      return true;
  }
  return false;
}

function cleanTitle(text: string) {
  const trimmed = text.replace(/\s*\(#\d+\)\s*$/, '').trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed;
}

/** Bots and dependency churn are not product history. */
export function isNoise(
  title: string,
  author: { type?: string; login?: string } | null
) {
  if (author?.type === 'Bot') return true;
  if (/\[bot\]$|^(renovate|dependabot|imgbot)/i.test(author?.login ?? ''))
    return true;
  return NOISE.test(title.trim());
}

export function classifyTitle(
  raw: string,
  knownTracks: ReadonlySet<string>,
  hashes: ReadonlySet<string> = CLIENT_TERM_HASHES
): Classified {
  const title = raw.trim();
  const match = CONVENTIONAL.exec(title);
  let kind: Kind;
  let track: string | undefined;
  let text: string;
  if (match) {
    const type = match[1].toLowerCase();
    kind = FEATURE_TYPES.has(type)
      ? 'feature'
      : FIX_TYPES.has(type)
        ? 'fix'
        : 'maintenance';
    const scopes = (match[2] ?? '')
      .split(',')
      .map((scope) => scope.trim().toLowerCase())
      .filter(Boolean);
    track = scopes.map((scope) => SCOPE_TRACKS[scope]).find(Boolean);
    text = match[3];
    if (!track && !scopes.length)
      track = KEYWORD_TRACKS.find(([re]) => re.test(text))?.[1];
  } else {
    text = title;
    kind = LEGACY_FEATURE.test(title)
      ? 'feature'
      : LEGACY_FIX.test(title)
        ? 'fix'
        : 'maintenance';
    track = KEYWORD_TRACKS.find(([re]) => re.test(title))?.[1];
  }
  const publicTrack = track && knownTracks.has(track) ? track : OTHER_TRACK;
  const cleaned = cleanTitle(text);
  const publishable =
    kind === 'feature' &&
    publicTrack !== OTHER_TRACK &&
    cleaned.length >= 8 &&
    cleaned.length <= 120 &&
    !INCIDENT_TERMS.test(title) &&
    !PLUMBING_TERMS.test(title) &&
    !INTERNAL_TERMS.test(title) &&
    !deniedTerm(title, hashes);
  return { track: publicTrack, kind, title: publishable ? cleaned : null };
}

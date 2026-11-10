import { CLIENT_TERM_HASHES } from '../content/title-denylist.ts';
import type { PrFact } from './model.ts';

/**
 * The "shipped" feed publishes merged PR titles, so it is an allowlist first
 * (user-facing change types in public product scopes) and a denylist second
 * (incident/security wording, internal plumbing, hashed client names).
 */

const SCOPE_TRACKS: Record<string, string> = {
  tasks: 'tasks',
  'tasks-ui': 'tasks',
  chat: 'chat',
  calendar: 'calendar',
  finance: 'finance',
  drive: 'drive',
  mail: 'mail',
  meet: 'meet',
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
  marketing: 'platform',
  web: 'platform',
  workspace: 'platform',
  satellite: 'platform',
  roadmap: 'platform',
  gateway: 'platform',
  sdk: 'dx',
  docs: 'dx',
  cli: 'dx',
};

const CHANGE_TYPES = new Set(['feat', 'perf']);

/** Incident, security and customer wording never reaches the public feed. */
export const INCIDENT_TERMS =
  /(secur|vuln|cve|exploit|leak|breach|incident|outage|post-?mortem|hotfix|revert|token|secret|credential|password|xss|csrf|ssrf|inject|attack|abuse|malicious|phish|spam|bypass|unauthori[sz]|expos|privilege|escalat|client|customer|tenant|compromis|forensic|rollback|protect|private|deny|denied|erase|reject|validat|sanitiz|redact|hmac|permission|consent|complain|bounce)/i;

/** Internal plumbing is real work but not a user-facing deliverable. */
export const PLUMBING_TERMS =
  /(\bci\b|seal|artifact|guard|allowlist|wrangler|node:test|vitest|digest|fixture|receipt|staging|runbook|\bD\d+\b|lint|format|oxfmt|type-?check|\bstub|\bmock|lockfile|manifest|inventory|normali[sz]|\bspy\b|\brpc\b|cutover|retained|admit|qualif|preview deploy|release please|agent|fleet|native|candidate|carve|registry|bridge|origin|hydrat|mount|evidence|satellite|worker|smoke|loop|redirect|route|cache|cookie|\bses\b|\bsns\b|\bdns\b|\(ut-|\(v\d|primitive|staff|lifecycle|module|endpoint|\bapi\b|start|vite|void|tanstack|next\.?js|vercel|cloudflare|migration|newsletter|dataset)/i;

const TITLE = /^([a-z]+)\(([a-z0-9,-]+)\)!?:\s*(.+)$/;

/** FNV-1a 64-bit over a lower-cased term. Matches scripts/hash-denylist-term.mjs. */
export function termHash(term: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(term.trim().toLowerCase())) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function mentionsDeniedTerm(text: string, hashes: ReadonlySet<string>) {
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

export type FeedItem = {
  number: number;
  title: string;
  track: string;
  kind: 'feature' | 'performance';
  mergedAt: string;
};

export function feedItem(
  pr: PrFact,
  hashes: ReadonlySet<string> = CLIENT_TERM_HASHES
): FeedItem | null {
  if (pr.state !== 'merged' || !pr.mergedAt) return null;
  const match = TITLE.exec(pr.title.trim());
  if (!match) return null;
  const [, type, scopes, rest] = match;
  if (!CHANGE_TYPES.has(type)) return null;
  const tracks = scopes.split(',').map((scope) => SCOPE_TRACKS[scope]);
  if (!tracks.length || tracks.some((track) => !track)) return null;
  const text = rest.replace(/\s*\(#\d+\)\s*$/, '').trim();
  if (text.length < 8 || text.length > 140) return null;
  if (INCIDENT_TERMS.test(pr.title) || PLUMBING_TERMS.test(pr.title))
    return null;
  if (mentionsDeniedTerm(pr.title, hashes)) return null;
  return {
    number: pr.number,
    title: text[0].toUpperCase() + text.slice(1),
    track: tracks[0] as string,
    kind: type === 'perf' ? 'performance' : 'feature',
    mergedAt: pr.mergedAt,
  };
}

export function shippedFeed(
  prs: readonly PrFact[],
  now: number,
  days = 7,
  hashes: ReadonlySet<string> = CLIENT_TERM_HASHES
) {
  const since = now - days * 86_400_000;
  return prs
    .filter((pr) => pr.mergedAt && Date.parse(pr.mergedAt) >= since)
    .map((pr) => feedItem(pr, hashes))
    .filter((item): item is FeedItem => item !== null)
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
}

/** Calendar day in Vietnam time, where the team works (UTC+7, no DST). */
export function localDay(iso: string) {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
}

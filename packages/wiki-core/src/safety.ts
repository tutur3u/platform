import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { wikiDocumentSchema } from './schema';
import {
  HASHED_TERMS,
  MAX_TERM_WORDS,
  PUBLIC_ONLY_SAFETY_RULES,
  PUBLIC_SAFETY_RULES,
  TERM_SALT,
} from './safety-rules';
import type { RichTextNode } from './types';
import { isWikiHost, parseWikiLink } from './urls';

export const WIKI_SAFETY_RULE_VERSION = 3;
export type WikiVisibility = 'private' | 'internal' | 'public';

/** Keys are canonical /wiki/<space>/<path> destinations resolved by the caller. */
export type WikiSafetyLinks = ReadonlyMap<string, WikiVisibility>;
export type WikiSafetyFinding = {
  rule: string;
  location: string;
};
type Metadata = { title?: string; description?: string };

const additionalRules = [
  ['32-hex identifier', /(?<![a-f0-9])[a-f0-9]{32}(?![a-f0-9])/i],
  [
    'internal hostname',
    /(?<![a-z0-9.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:tutur3u\.com|internal|tailnet|local)\b|\blocalhost\b/i,
  ],
  [
    'private network address',
    /\b(?:127|10|0)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b169\.254\.\d{1,3}\.\d{1,3}\b|\b(?:fc|fd)[0-9a-f]{2}:[0-9a-f:]+|\bfe[89ab][0-9a-f]:[0-9a-f:]+/i,
  ],
  [
    'developer home-directory path',
    /(?:^|[^\w])(?:\/(?:Users|home)\/[^/\s]+|~\/|[A-Z]:\\Users\\[^\\\s]+)/i,
  ],
] as const;
const rules = [
  ...PUBLIC_SAFETY_RULES,
  ...PUBLIC_ONLY_SAFETY_RULES,
  ...additionalRules,
];
const hashedLookup = new Map(
  Object.entries(HASHED_TERMS).flatMap(([label, hashes]) =>
    hashes.map((hash) => [hash, label] as const)
  )
);
const maxHashedWordLength = 128;
const assignment = /(?<![a-z0-9_])([a-z0-9_]+)["']?\s*[:=]\s*(?=\S)/gi;
const secretName =
  /token|secret|password|passwd|credential|bypass|_key(?:_|$)/i;
const ipv6Candidate =
  /(?<![0-9a-f:])[0-9a-f:]{2,39}(?:\.\d{1,3}){0,3}(?![0-9a-f:]|\.[0-9a-f:.])/gi;

function normalizeSafetyText(value: string): string {
  return value.normalize('NFKC').replace(/\p{Cf}/gu, '');
}

function hasSecretAssignment(source: string): boolean {
  for (const match of source.matchAll(assignment)) {
    if (secretName.test(match[1] ?? '')) return true;
  }
  return false;
}

function hasPrivateIpv6(source: string): boolean {
  for (const { 0: candidate, index } of source.matchAll(ipv6Candidate)) {
    const colon = candidate.indexOf(':');
    if (colon < 0 || candidate.indexOf(':', colon + 1) < 0) continue;
    // URL canonicalization expands mixed IPv4 notation into hexadecimal words.
    const address = `http://[${candidate}]`;
    if (!URL.canParse(address)) continue;
    const host = new URL(address).hostname;
    if (host === '[::1]') return true;
    if (
      host === '[::]' &&
      source[index - 1] === '[' &&
      source[index + candidate.length] === ']'
    )
      return true;
    const highWord = /^\[::ffff:([a-f0-9]{1,4}):[a-f0-9]{1,4}\]$/i.exec(
      host
    )?.[1];
    if (highWord !== undefined) {
      const number = Number.parseInt(highWord, 16);
      const first = number >>> 8;
      const second = number & 255;
      if (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 100 && second >= 64 && second <= 127)
      )
        return true;
    }
  }
  return false;
}

export function hashWikiSafetyTerm(term: string): string {
  return hashNormalizedTerm(
    normalizeSafetyText(term)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  );
}

function hashNormalizedTerm(normalized: string): string {
  return bytesToHex(
    sha256(new TextEncoder().encode(`${TERM_SALT}:${normalized}`))
  );
}

function inspectTerms(
  normalizedSource: string,
  report: (rule: string) => void,
  cache: Map<string, string | undefined>
) {
  const words = normalizedSource.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  function labelOf(value: string) {
    if (cache.has(value)) return cache.get(value);
    const label = hashedLookup.get(hashNormalizedTerm(value));
    if (cache.size < 20_000) cache.set(value, label);
    return label;
  }
  for (const [index, word] of words.entries()) {
    let joined = '';
    for (
      let next = index;
      next < Math.min(index + MAX_TERM_WORDS, words.length);
      next++
    ) {
      joined += words[next];
      if (joined.length > maxHashedWordLength) break;
      const label = labelOf(joined);
      if (label) report(label);
    }
    for (let length = 3; length < Math.min(word.length, 25); length++) {
      const label = labelOf(word.slice(0, length));
      if (label === 'fleet host or machine name') report(label);
    }
  }
}

function linkFinding(href: string, links: WikiSafetyLinks): string | undefined {
  const url = parseWikiLink(href);
  if (!url) return 'unsupported link';
  if (href.startsWith('#')) return;
  const wikiHost = isWikiHost(url.hostname);
  const legacyDocs = url.hostname.replace(/\.$/, '') === 'docs.tuturuuu.com';
  if (!wikiHost && !legacyDocs) return;
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '');
  const pagePath = legacyDocs ? path : path.replace(/^\/wiki\/[^/]+/, '');
  if (/^\/build(?:\/|$)/i.test(pagePath)) return 'link into held build subtree';
  if (legacyDocs || links.get(path) !== 'public')
    return 'link to non-public or unresolved wiki page';
}

function visibleText(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const separator = [
    'paragraph',
    'heading',
    'detailsSummary',
    'codeBlock',
  ].includes(node.type)
    ? ''
    : '\n';
  return (node.content ?? []).map(visibleText).join(separator);
}

/** Run at publish time with a trusted visibility snapshot and the revision metadata. */
export function scanPublicSafety(
  input: unknown,
  links: WikiSafetyLinks = new Map(),
  metadata: Metadata = {}
): WikiSafetyFinding[] {
  const parsed = wikiDocumentSchema.safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => ({
      rule: 'invalid wiki content',
      location: ['body', ...issue.path.map(String)].join('.'),
    }));

  const findings = new Map<string, WikiSafetyFinding>();
  const cache = new Map<string, string | undefined>();
  function report(rule: string, location: string) {
    findings.set(`${rule}:${location}`, { rule, location });
  }
  function inspect(value: string, location: string) {
    const normalized = normalizeSafetyText(value);
    for (const [rule, pattern] of rules)
      if (pattern.test(normalized)) report(rule, location);
    if (hasSecretAssignment(normalized)) report('secret assignment', location);
    if (hasPrivateIpv6(normalized)) report('private network address', location);
    inspectTerms(normalized, (rule) => report(rule, location), cache);
  }
  function attrs(
    attributes: Record<string, unknown> | undefined,
    location: string
  ) {
    for (const [key, value] of Object.entries(attributes ?? {})) {
      if (typeof value !== 'string') continue;
      const field = `${location}.${key}`;
      if (key === 'href') {
        try {
          const url = parseWikiLink(value);
          if (url?.hostname) inspect(url.hostname, field);
          const rule = linkFinding(value, links);
          if (rule) report(rule, field);
        } catch {
          report('unsupported link', field);
        }
      }
      inspect(value, field);
      if (key === 'href' && value.includes('%')) {
        let decoded = value;
        for (let pass = 0; pass < 3 && decoded.includes('%'); pass++) {
          let next: string;
          try {
            next = decodeURIComponent(decoded);
          } catch {
            if (pass === 0) report('unsupported link', field);
            break;
          }
          if (next === decoded) break;
          inspect(next, field);
          decoded = next;
        }
      }
    }
  }
  function visit(node: RichTextNode, location: string) {
    attrs(node.attrs, `${location}.attrs`);
    node.marks?.forEach((mark, index) =>
      attrs(mark.attrs, `${location}.marks.${index}.attrs`)
    );
    node.content?.forEach((child, index) =>
      visit(child, `${location}.content.${index}`)
    );
  }
  inspect(visibleText(parsed.data), 'body');
  if (metadata.title !== undefined) inspect(metadata.title, 'title');
  if (metadata.description !== undefined)
    inspect(metadata.description, 'description');
  visit(parsed.data, 'body');
  return [...findings.values()];
}

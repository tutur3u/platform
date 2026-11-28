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

export const WIKI_SAFETY_RULE_VERSION = 1;
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
    'secret assignment',
    /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIAL|BYPASS)[A-Z0-9_]*["']?\s*[:=]\s*[^\s]/,
  ],
  [
    'internal hostname',
    /\b(?:[a-z0-9][a-z0-9.-]*\.(?:tutur3u\.com|internal|tailnet|local)|localhost)\b/i,
  ],
  [
    'private network address',
    /\b(?:127|10|0)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b169\.254\.\d{1,3}\.\d{1,3}\b|\b(?:fc|fd)[0-9a-f]{2}:[0-9a-f:]+|\bfe[89ab][0-9a-f]:[0-9a-f:]+|::1\b/i,
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

export function hashWikiSafetyTerm(term: string): string {
  const normalized = term.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return bytesToHex(
    sha256(new TextEncoder().encode(`${TERM_SALT}:${normalized}`))
  );
}

function inspectTerms(
  source: string,
  report: (rule: string) => void,
  cache: Map<string, string | undefined>
) {
  const words = source.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  function labelOf(value: string) {
    if (cache.has(value)) return cache.get(value);
    const label = hashedLookup.get(hashWikiSafetyTerm(value));
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
    for (const [rule, pattern] of rules)
      if (pattern.test(value)) report(rule, location);
    inspectTerms(value, (rule) => report(rule, location), cache);
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
        try {
          inspect(decodeURIComponent(value), field);
        } catch {
          report('unsupported link', field);
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

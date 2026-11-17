import { stripLeakedCss } from '@/lib/mail/snippet-source';

/** Compact list previews use readable text; original message content stays intact. */
export function mailSnippetText(text: string) {
  return stripLeakedCss(text)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/gu, '$1')
    .replace(/(^|\n)\s*(?:#{1,6}\s+|>\s+|[-+*]\s+)/gu, '$1')
    .replace(/(^|\s)[*_]{1,3}(?=\S)/gu, '$1')
    .replace(/(\S)[*_]{1,3}(?=\s|$|[.,!?;:])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Readable preview text for list rows and stored snippets.
 *
 * Senders leak markup into previews in two ways: HTML-only bodies carry
 * `<style>`/`<head>` blocks and comments, and template engines (Laravel
 * markdown mail, MJML exports) emit their stylesheet as the first lines of the
 * text/plain part. HTML input loses its non-visible regions and tags; both
 * kinds lose stylesheet rule blocks. Detection is strict (known at-rules, or
 * selectors built only from tag names, classes, ids and attributes, with a
 * body made only of `property: value` declarations), so prose with braces
 * survives. Every pass is linear in the bounded input.
 */
import { stripLeakedCss } from './snippet-css';

export { stripLeakedCss };

const MAX_SOURCE_LENGTH = 20_000;

const HIDDEN_HTML_REGIONS =
  /<(style|script|head|title|template|noscript|xml)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu;
const HTML_COMMENTS = /<!--[\s\S]*?(?:-->|$)/gu;
const CONDITIONAL_COMMENTS = /<!\[[^\]<>]{0,200}\]>/gu;
const DOCTYPE = /<!doctype[^>]*>/giu;
const HTML_TAG = /<\/?[a-z](?:"[^"]*"|'[^']*'|[^<>"'])*>/giu;
const INVISIBLE = /[​-‍⁠﻿­]|͏/gu;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  zwnj: '',
  zwj: '',
};

function decodeEntities(value: string) {
  return value.replace(
    /&(#x[\da-f]{1,6}|#\d{1,7}|[a-z]{2,8});/giu,
    (match, entity: string) => {
      if (entity[0] !== '#') {
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
      }
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      const valid =
        Number.isInteger(code) &&
        code > 0 &&
        code <= 0x10ffff &&
        (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
    }
  );
}

function stripHtmlMarkup(value: string) {
  return decodeEntities(
    value
      .replace(HTML_COMMENTS, ' ')
      .replace(CONDITIONAL_COMMENTS, ' ')
      .replace(DOCTYPE, ' ')
      .replace(HIDDEN_HTML_REGIONS, ' ')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/(?:p|div|tr|li|h[1-6])>/giu, '\n')
      .replace(HTML_TAG, ' ')
  );
}

/**
 * Preview text from a message part. `html` sources lose markup and decode
 * entities; plain-text sources keep their characters (`a < b`,
 * `Name <a@b.c>`) and only lose leaked stylesheet blocks.
 */
export function cleanSnippetSource(
  value: string | null | undefined,
  { html = false }: { html?: boolean } = {}
) {
  if (!value) return '';
  const bounded = value.slice(0, MAX_SOURCE_LENGTH);
  const text = html ? stripHtmlMarkup(bounded) : bounded;
  return stripLeakedCss(text)
    .replace(INVISIBLE, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

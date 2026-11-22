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

// The capture group that matched names the element. Reading the name from the
// matched text would miss case-folded spellings the /iu opener accepts.
const HIDDEN_TAG_NAMES = [
  'style',
  'script',
  'head',
  'title',
  'template',
  'noscript',
  'xml',
] as const;
const HIDDEN_TAG_OPENER =
  /<(?:(style)|(script)|(head)|(title)|(template)|(noscript)|(xml))\b/giu;
const DOCTYPE_OPENER = /<!doctype/giu;
// One fixed closing pattern per hidden element, so no pattern is built from
// input text.
const HIDDEN_TAG_CLOSERS: Readonly<Record<string, RegExp>> = {
  head: /<\/head\s*>/giu,
  noscript: /<\/noscript\s*>/giu,
  script: /<\/script\s*>/giu,
  style: /<\/style\s*>/giu,
  template: /<\/template\s*>/giu,
  title: /<\/title\s*>/giu,
  xml: /<\/xml\s*>/giu,
};
const HTML_COMMENTS = /<!--[\s\S]*?(?:-->|$)/gu;
const CONDITIONAL_COMMENTS = /<!\[[^\]<>]{0,200}\]>/gu;
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

/**
 * Replaces each region that starts at an `opener` match and runs through the
 * next `>` (and, for hidden elements, through the matching closing tag or the
 * end of input) with a space. This is `<name\b[^>]*>[\s\S]*?(?:<\/name\s*>|$)`
 * without its quadratic case: the next `>` is cached and only moves forward,
 * and when no `>` remains no later opener can match, so the scan stops.
 */
function replaceTagRegions(
  value: string,
  opener: RegExp,
  { closing }: { closing: boolean }
) {
  let output = '';
  let index = 0;
  let nextGt = -1;
  opener.lastIndex = 0;
  for (
    let match = opener.exec(value);
    match !== null;
    match = opener.exec(value)
  ) {
    const start = match.index;
    if (nextGt < start) nextGt = value.indexOf('>', start);
    if (nextGt === -1) break;
    let end = nextGt + 1;
    const close = closing
      ? HIDDEN_TAG_CLOSERS[
          HIDDEN_TAG_NAMES[match.slice(1).findIndex(Boolean)] ?? ''
        ]
      : undefined;
    if (close) {
      close.lastIndex = end;
      const closed = close.exec(value);
      end = closed ? closed.index + closed[0].length : value.length;
    }
    output += `${value.slice(index, start)} `;
    index = end;
    opener.lastIndex = end;
  }
  return output + value.slice(index);
}

function stripHtmlMarkup(value: string) {
  const withoutComments = value
    .replace(HTML_COMMENTS, ' ')
    .replace(CONDITIONAL_COMMENTS, ' ');
  const withoutDoctype = replaceTagRegions(withoutComments, DOCTYPE_OPENER, {
    closing: false,
  });
  return decodeEntities(
    replaceTagRegions(withoutDoctype, HIDDEN_TAG_OPENER, { closing: true })
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

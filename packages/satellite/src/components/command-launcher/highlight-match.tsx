import { Fragment } from 'react';

export type MatchRange = { end: number; start: number };

/**
 * Case-insensitive ranges of `query` (or of its words, when the whole query
 * does not occur) inside `text`. Returns no ranges when lowercasing changes
 * the string length, so offsets never split a character.
 */
export function findMatchRanges(text: string, query: string): MatchRange[] {
  const needle = query.trim().toLowerCase();
  const haystack = text.toLowerCase();
  if (!needle || haystack.length !== text.length) return [];

  const whole = haystack.indexOf(needle);
  if (whole >= 0) return [{ end: whole + needle.length, start: whole }];

  const ranges: MatchRange[] = [];
  for (const word of needle.split(/\s+/u)) {
    if (word.length < 2) continue;
    const start = haystack.indexOf(word);
    if (start >= 0) ranges.push({ end: start + word.length, start });
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: MatchRange[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/**
 * Renders `text` with matched parts in `<mark>`. Output is React text nodes
 * only; result titles never reach the DOM as HTML.
 */
export function HighlightMatch({
  query,
  text,
}: {
  query: string;
  text: string;
}) {
  const ranges = findMatchRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;

  const parts: { key: string; match: boolean; value: string }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({
        key: `t${cursor}`,
        match: false,
        value: text.slice(cursor, range.start),
      });
    }
    parts.push({
      key: `m${range.start}`,
      match: true,
      value: text.slice(range.start, range.end),
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push({ key: `t${cursor}`, match: false, value: text.slice(cursor) });
  }

  return (
    <>
      {parts.map((part) =>
        part.match ? (
          <mark
            className="bg-transparent font-semibold text-foreground underline decoration-muted-foreground underline-offset-3"
            key={part.key}
          >
            {part.value}
          </mark>
        ) : (
          <Fragment key={part.key}>{part.value}</Fragment>
        )
      )}
    </>
  );
}

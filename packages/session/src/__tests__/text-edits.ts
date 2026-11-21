/**
 * Single-spot edits of canonical test text, for building one targeted
 * mutation of a signed or parsed document. Each edit uses only indexOf and
 * slice, and throws when its anchor is empty or missing, so a fixture change
 * cannot silently leave the text unchanged.
 */

function anchorIndex(text: string, anchor: string): number {
  if (anchor.length === 0) throw new Error('empty anchor');
  const at = text.indexOf(anchor);
  if (at === -1) throw new Error(`anchor ${anchor} not found`);
  return at;
}

/** Inserts `addition` right after the first `anchor`. */
export function insertAfter(
  text: string,
  anchor: string,
  addition: string
): string {
  const end = anchorIndex(text, anchor) + anchor.length;
  return text.slice(0, end) + addition + text.slice(end);
}

/** Inserts `addition` right before the first `anchor`. */
export function insertBefore(
  text: string,
  anchor: string,
  addition: string
): string {
  const at = anchorIndex(text, anchor);
  return text.slice(0, at) + addition + text.slice(at);
}

/** Replaces the first `anchor` with `replacement`. */
export function replaceFirst(
  text: string,
  anchor: string,
  replacement: string
): string {
  const at = anchorIndex(text, anchor);
  return text.slice(0, at) + replacement + text.slice(at + anchor.length);
}

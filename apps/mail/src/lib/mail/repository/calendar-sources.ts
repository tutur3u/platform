import { decodeCalendarSource } from '../calendar-invitation';

/** Only newline-equivalent copies are safe to treat as one scheduling request. */
export function coalesceCalendarSources(sources: Uint8Array[]) {
  if (!sources.length || sources.length > 8) return null;
  let total = 0;
  let selected: string | null = null;
  for (const bytes of sources) {
    total += bytes.byteLength;
    if (
      !bytes.byteLength ||
      bytes.byteLength > 256 * 1024 ||
      total > 512 * 1024
    )
      return null;
    let source: string | null;
    try {
      source = decodeCalendarSource(bytes)?.replaceAll('\r\n', '\n') ?? null;
    } catch {
      return null;
    }
    if (!source || (selected !== null && source !== selected)) return null;
    selected = source;
  }
  return selected;
}

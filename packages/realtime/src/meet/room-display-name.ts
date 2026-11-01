/**
 * Normalises user-supplied display-name text: strips control/format
 * characters (incl. bidi), collapses every run of separator or whitespace
 * characters (\p{Z}, U+2028/2029, U+3000, tabs) to one space, then trims.
 * Padding can therefore never push the guest suffix out of a truncated view.
 */
export function normalizeDisplayNameText(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[\p{Z}\s]+/gu, ' ')
    .trim();
}

export function lobbyDisplayName(value: string): string {
  const clean = normalizeDisplayNameText(value);
  const suffix = ' (guest)';
  let name = '';
  for (const character of clean || 'Participant') {
    if (name.length + character.length + suffix.length > 120) break;
    name += character;
  }
  return name.trimEnd() + suffix;
}

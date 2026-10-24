/** Push previews are plain text. Never export URL credentials or remote images. */
export function mailPushPreview(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/gu, '')
    // Nested or unterminated markup can leave delimiters behind; drop them all.
    .replace(/[<>]/gu, '')
    .replace(/\b(?:[a-z][a-z0-9+.-]*:|www\.)[^\s<>"']+/giu, '…')
    .replace(/\/\/[^\s<>"']+/gu, '…')
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return text ? Array.from(text).slice(0, 160).join('') : null;
}

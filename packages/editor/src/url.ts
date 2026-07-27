const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const RELATIVE_URL = /^(?:[/?#]|\.\.?\/)/u;

const hasControlCharacters = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
};

/**
 * Normalize a rich-text link or image URL.
 *
 * Returns an empty string for an intentionally cleared URL and `null` for an
 * unsafe or malformed value.
 */
export function normalizeRichTextUrl(value: unknown): string | null {
  const href = String(value ?? '').trim();
  if (!href) return '';
  if (hasControlCharacters(href)) return null;
  if (RELATIVE_URL.test(href)) return href;

  try {
    const url = new URL(href);
    return SAFE_URL_SCHEMES.has(url.protocol.toLowerCase()) ? href : null;
  } catch {
    return null;
  }
}

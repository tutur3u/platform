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
  const normalizedHref = href.replace(/\s/gu, (character) =>
    encodeURIComponent(character)
  );
  if (RELATIVE_URL.test(normalizedHref)) return normalizedHref;

  try {
    const url = new URL(normalizedHref);
    return SAFE_URL_SCHEMES.has(url.protocol.toLowerCase())
      ? normalizedHref
      : null;
  } catch {
    return null;
  }
}

/** Images may use web or relative URLs, never mail or phone schemes. */
export function normalizeRichTextImageUrl(value: unknown): string | null {
  const src = normalizeRichTextUrl(value);
  if (!src) return src;
  if (RELATIVE_URL.test(src)) return src;

  try {
    const url = new URL(src);
    return ['http:', 'https:'].includes(url.protocol.toLowerCase())
      ? src
      : null;
  } catch {
    return null;
  }
}

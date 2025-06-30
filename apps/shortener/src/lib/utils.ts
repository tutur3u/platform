import { nanoid } from 'nanoid';

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a string is a valid slug (alphanumeric, hyphens, underscores only)
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9\-_]+$/.test(slug);
}

/**
 * Generates a random URL-safe slug
 */
export function generateSlug(length = 6): string {
  return nanoid(length);
}

/**
 * Normalizes a URL by trimming whitespace and ensuring it has a protocol
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  // Add https:// if no protocol is specified
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

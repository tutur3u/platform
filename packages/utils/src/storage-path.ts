/**
 * Storage Path Sanitization Utilities
 *
 * Provides secure path and filename sanitization for file storage operations.
 * Prevents directory traversal attacks and ensures safe file operations.
 */

const UNSAFE_PATH_CHARACTER = /[\p{Cc}\\]/u;

/**
 * Validates an exact relative path without canonicalizing it.
 *
 * @returns The path segments, or null if the path is unsafe
 */
export function sanitizePathSegments(
  path: string,
  options: { strict?: boolean } = {}
): string[] | null {
  if (path === '') return [];
  if (
    typeof path !== 'string' ||
    UNSAFE_PATH_CHARACTER.test(path) ||
    /^[a-z][a-z\d+.-]*:\/\//i.test(path) ||
    (options.strict && (path.includes('?') || path.includes('#')))
  ) {
    return null;
  }

  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0)) return null;

  for (const segment of segments) {
    let decoded = segment;
    for (let pass = 0; pass < 5; pass += 1) {
      const next = decoded.replace(/%([\da-f]{2})/gi, (_match, byte: string) =>
        String.fromCharCode(Number.parseInt(byte, 16))
      );
      if (next === decoded) break;
      decoded = next;
    }
    const next = decoded.replace(/%([\da-f]{2})/gi, (_match, byte: string) =>
      String.fromCharCode(Number.parseInt(byte, 16))
    );
    if (next !== decoded) return null;
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      UNSAFE_PATH_CHARACTER.test(decoded)
    ) {
      return null;
    }
  }

  return segments;
}

/**
 * Canonicalizes a legacy relative path, then validates its segments. Literal
 * `?` and `#` are allowed for callers that encode object keys at the transport
 * boundary; use `sanitizePathStrict` for paths interpolated into URLs.
 *
 * @param path - The path string to sanitize
 * @returns Canonicalized path string, or null if the path is unsafe
 *
 * @example
 * ```ts
 * sanitizePath('folder/subfolder') // => 'folder/subfolder'
 * sanitizePath('../../../etc/passwd') // => null
 * sanitizePath('folder\\subfolder') // => 'folder/subfolder'
 * sanitizePath('') // => ''
 * ```
 */
export function sanitizePath(path: string): string | null {
  if (typeof path !== 'string' || /^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    return null;
  }
  const canonicalPath = path
    .replaceAll('\\', '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
  const segments = sanitizePathSegments(canonicalPath);
  return segments === null ? null : segments.join('/');
}

/** Validate the exact path representation supplied to URL-interpolating APIs. */
export function sanitizePathStrict(path: string): string | null {
  const segments = sanitizePathSegments(path, { strict: true });
  return segments === null ? null : segments.join('/');
}

/** Encode URL delimiters in storage keys while preserving path separators. */
export function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Sanitizes a folder name to prevent directory traversal and invalid characters.
 *
 * @param name - The folder name to sanitize
 * @returns Sanitized folder name, or null if the name contains invalid characters
 *
 * @example
 * ```ts
 * sanitizeFolderName('my-folder') // => 'my-folder'
 * sanitizeFolderName('folder/subfolder') // => null (contains slashes)
 * sanitizeFolderName('..') // => null (traversal attempt)
 * sanitizeFolderName('folder\\name') // => null (normalized to 'folder/name' which contains slash)
 * ```
 */
export function sanitizeFolderName(name: string): string | null {
  if (!name) return null;
  const normalized = name
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/g, '');
  const segments = sanitizePathSegments(normalized, { strict: true });
  return segments?.length === 1 && !segments[0]!.includes('..')
    ? segments[0]!
    : null;
}

/**
 * Sanitizes a filename to prevent directory traversal and invalid characters.
 * Enforces strict validation rules including:
 * - ASCII letters and digits only
 * - Allowed special characters: space, underscore, hyphen, dot
 * - No control characters or Unicode exploits
 * - Maximum length of 255 characters
 * - No leading/trailing spaces or dots
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename, or null if the filename contains invalid characters
 *
 * @example
 * ```ts
 * sanitizeFilename('document.pdf') // => 'document.pdf'
 * sanitizeFilename('../../../etc/passwd') // => null (traversal attempt)
 * sanitizeFilename('file\x00name.txt') // => null (control character)
 * sanitizeFilename('very-long-name...') // => null (if exceeds 255 chars)
 * sanitizeFilename(' .hidden') // => null (leading space/dot)
 * ```
 */
export function sanitizeFilename(filename: string): string | null {
  if (!filename) return null;

  // Get the basename to remove any path components
  // Using a simple approach without node:path for better portability
  const lastSlash = Math.max(
    filename.lastIndexOf('/'),
    filename.lastIndexOf('\\')
  );
  const base = lastSlash >= 0 ? filename.substring(lastSlash + 1) : filename;

  // Reject if basename differs from original (indicates path traversal attempt)
  if (base !== filename) {
    return null;
  }

  // Normalize to NFC (Canonical Decomposition, followed by Canonical Composition)
  const normalized = base.normalize('NFC');

  // Check length (255 characters max)
  if (normalized.length === 0 || normalized.length > 255) {
    return null;
  }

  // Reject leading/trailing spaces or dots
  if (
    normalized.startsWith(' ') ||
    normalized.endsWith(' ') ||
    normalized.startsWith('.') ||
    normalized.endsWith('.')
  ) {
    return null;
  }

  // Allows: Letters, Numbers, Spaces, Dots, Underscores, Hyphens, and Parentheses
  const allowedPattern = /^[a-zA-Z0-9\s._()/-]+$/;
  if (!allowedPattern.test(normalized)) {
    return null;
  }

  return normalized;
}

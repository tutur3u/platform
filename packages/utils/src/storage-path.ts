/**
 * Storage Path Sanitization Utilities
 *
 * Provides secure path and filename sanitization for file storage operations.
 * Prevents directory traversal attacks and ensures safe file operations.
 */

/**
 * Sanitizes a path component to prevent directory traversal attacks.
 *
 * @param path - The path string to sanitize
 * @returns Sanitized path string, or null if the path contains invalid characters
 *
 * @example
 * ```ts
 * sanitizePath('folder/subfolder') // => 'folder/subfolder'
 * sanitizePath('../../../etc/passwd') // => null
 * sanitizePath('folder\\subfolder') // => 'folder/subfolder' (backslashes normalized)
 * sanitizePath('') // => ''
 * ```
 */
export function sanitizePath(path: string): string | null {
  if (!path) return '';

  // Normalize backslashes to forward slashes (Windows compatibility)
  let sanitized = path.replace(/\\/g, '/');

  // Trim and remove leading/trailing slashes
  sanitized = sanitized.trim().replace(/^\/+|\/+$/g, '');

  // Split into segments and validate each
  const segments = sanitized.split('/').filter(Boolean);

  for (const segment of segments) {
    // Reject any segment that is '..' or '.' or empty
    if (segment === '..' || segment === '.' || segment === '') {
      return null;
    }
    // Reject segments with path traversal attempts
    if (segment.includes('..')) {
      return null;
    }
  }

  // Rejoin with forward slashes
  return segments.join('/');
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

  // Trim and remove leading/trailing slashes
  const trimmed = name.trim().replace(/^\/+|\/+$/g, '');

  // Replace backslashes with forward slashes
  const normalized = trimmed.replace(/\\/g, '/');

  // Reject if it contains slashes (should be a single name, not a path)
  if (normalized.includes('/')) {
    return null;
  }

  // Reject path traversal attempts
  if (normalized === '..' || normalized === '.' || normalized.includes('..')) {
    return null;
  }

  return normalized;
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

  // Enforce conservative allowlist: ASCII letters, digits, space, underscore, hyphen, dot
  const allowedPattern = /^[a-zA-Z0-9\s._-]+$/;
  if (!allowedPattern.test(normalized)) {
    return null;
  }

  return normalized;
}

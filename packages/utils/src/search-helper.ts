/**
 * Sanitizes a search query by trimming it and removing control characters.
 * @param value The search query to sanitize
 * @returns The sanitized search query or null if empty
 */
export const sanitizeSearchQuery = (value?: string | null): string | null => {
  if (!value) return null;
  const sanitized = value.replace(/\p{Cc}/gu, '').trim();
  return sanitized.length > 0 ? sanitized : null;
};

/**
 * Escapes special characters in a string for use in a SQL LIKE pattern.
 * @param value The string to escape
 * @returns The escaped string
 */
export const escapeLikePattern = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

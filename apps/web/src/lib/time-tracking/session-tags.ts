import { z } from 'zod';

/**
 * Tags a tracking session may carry, such as `pomodoro` for Pomodoro focus.
 * Lowercase slugs only, so stats can filter by exact match.
 */
export const SESSION_TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const MAX_SESSION_TAGS = 10;

export const sessionTagSchema = z.string().regex(SESSION_TAG_PATTERN);

export const sessionTagsSchema = z
  .array(sessionTagSchema)
  .max(MAX_SESSION_TAGS);

/** Deduplicated tags for an insert, or null when there are none. */
export function normalizeSessionTags(
  tags: readonly string[] | null | undefined
): string[] | null {
  if (!tags || tags.length === 0) return null;
  return [...new Set(tags)];
}

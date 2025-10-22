import { z } from 'zod';

/**
 * Slug validation schema
 * Slugs must be:
 * - lowercase alphanumeric with hyphens
 * - 3-63 characters long
 * - start and end with alphanumeric character
 */
export const workspaceSlugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(63, 'Slug must be at most 63 characters')
  .regex(
    /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/,
    'Slug must be lowercase alphanumeric with hyphens, and start/end with a letter or number'
  )
  .refine(
    (slug) =>
      !['personal', 'internal', 'admin', 'api', 'settings'].includes(slug),
    'This slug is reserved and cannot be used'
  );

/**
 * Reserved slugs that cannot be used for workspaces
 */
export const RESERVED_SLUGS = [
  'personal',
  'internal',
  'admin',
  'api',
  'settings',
  'auth',
  'login',
  'logout',
  'signup',
  'register',
  'dashboard',
  'workspace',
  'workspaces',
  'user',
  'users',
  'profile',
  'account',
  'billing',
  'pricing',
  'about',
  'contact',
  'support',
  'help',
  'terms',
  'privacy',
  'docs',
  'documentation',
  'blog',
  'changelog',
  'status',
  'health',
] as const;

/**
 * Validate if a string is a valid workspace slug
 */
export function isValidWorkspaceSlug(slug: string): boolean {
  const result = workspaceSlugSchema.safeParse(slug);
  return result.success;
}

/**
 * Generate a URL-friendly slug from a string
 * @param input - The input string to convert to a slug
 * @returns A URL-friendly slug
 */
export function generateSlug(input: string): string {
  return (
    input
      .toLowerCase()
      // Remove special characters except hyphens and spaces
      .replace(/[^a-z0-9\s-]/g, '')
      // Replace spaces with hyphens
      .replace(/\s+/g, '-')
      // Remove multiple consecutive hyphens
      .replace(/-+/g, '-')
      // Remove leading and trailing hyphens
      .replace(/^-+|-+$/g, '')
      // Truncate to 63 characters
      .substring(0, 63)
  );
}

/**
 * Generate a unique slug with a counter suffix
 * @param baseSlug - The base slug to use
 * @param counter - The counter to append
 * @returns A slug with counter suffix
 */
export function generateSlugWithCounter(
  baseSlug: string,
  counter: number
): string {
  const maxBaseLength = 50; // Leave room for counter
  const truncatedBase = baseSlug.substring(0, maxBaseLength);
  return `${truncatedBase}-${counter}`;
}

/**
 * Validate and sanitize a slug input
 * Returns the sanitized slug or throws an error if invalid
 */
export function validateAndSanitizeSlug(input: string): string {
  const slug = generateSlug(input);

  if (slug.length < 3) {
    throw new Error('Slug must be at least 3 characters after sanitization');
  }

  if (RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number])) {
    throw new Error(`The slug "${slug}" is reserved and cannot be used`);
  }

  const result = workspaceSlugSchema.safeParse(slug);

  if (!result.success) {
    throw new Error(result.error.errors[0]?.message || 'Invalid slug');
  }

  return slug;
}

/**
 * Check if a slug is reserved
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number]);
}

/**
 * Format a workspace identifier for display
 * If it's a UUID, return it as-is
 * If it's a slug, format it nicely
 */
export function formatWorkspaceIdentifier(identifier: string): string {
  // Check if it's a UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(identifier)) {
    return identifier;
  }

  // It's a slug, capitalize first letter of each word
  return identifier
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

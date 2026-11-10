import { z } from 'zod';

export const WORKSPACE_HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

export const workspaceHandleSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(WORKSPACE_HANDLE_REGEX);

/**
 * Workspace handles that a workspace may not take, because the same first path
 * segment on tuturuuu.com belongs to Tuturuuu itself: the reserved workspace
 * routes, and every app that is (or will be) mounted at tuturuuu.com/<app>.
 * Web serves workspaces at tuturuuu.com/<handle>, so a workspace named after a
 * mounted app would be shadowed by that app.
 *
 * Existing workspaces are not validated against this list on read; only new
 * handle writes are refused.
 */
export const RESERVED_WORKSPACE_HANDLES: readonly string[] = [
  // Reserved workspace routes.
  'home',
  'internal',
  'login',
  'onboarding',
  'personal',
  // Apps mounted, or planned to mount, at tuturuuu.com/<path>.
  'ai',
  'apps',
  'calendar',
  'chat',
  'cms',
  'colab',
  'contacts',
  'design',
  'docs',
  'drive',
  'finance',
  'forms',
  'hive',
  'infrastructure',
  'inventory',
  'learn',
  'lettin',
  'mail',
  'meet',
  'mind',
  'nova',
  'parley',
  'pay',
  'products',
  'rewise',
  'roadmap',
  'shortener',
  'store',
  'storefront',
  'tasks',
  'teach',
  'tools',
  'track',
  'workspace',
];

const RESERVED_WORKSPACE_HANDLE_SET = new Set(RESERVED_WORKSPACE_HANDLES);

/** Whether a (case-insensitive, trimmed) workspace handle is reserved. */
export function isReservedWorkspaceHandle(handle: string): boolean {
  return RESERVED_WORKSPACE_HANDLE_SET.has(handle.trim().toLowerCase());
}

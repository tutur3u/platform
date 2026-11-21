import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
} from '@tuturuuu/utils/constants';

// Same literal check as isWorkspaceUuidLiteral (asserted in the test), kept
// local so the proxy and layout do not import the server workspace helper.
const WORKSPACE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route-shape classification for signed-out requests (USER M-6, option A).
 *
 * The app routes `app/[locale]/(dashboard)/[wsId]` at the top level, and a
 * workspace id may be a custom handle, so `/<anything>` has the shape of a
 * workspace link. Deciding "unknown path" by looking the handle up would leak
 * which workspaces exist (and need an anonymous admin read), so the decision
 * here depends only on the URL's shape:
 *
 * - KNOWN shape (keeps the existing login redirect): a known top-level route,
 *   a first segment that is a workspace UUID, `personal` or `internal`, or a
 *   `/<x>/<known workspace child route>` path.
 * - UNKNOWN shape: everything else, which renders the not-found page (404) for
 *   signed-out visitors. A bare `/<handle>` link is one "Sign in" click away.
 *
 * Both lists are bound to the real app directory by route-shape.test.ts.
 */

/** Route segments directly under `app/[locale]` (route groups flattened). */
export const KNOWN_ROOT_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  'about',
  'acceptable-use',
  'account',
  'add-account',
  'ai',
  'auth',
  'blog',
  'branding',
  'calendar',
  'careers',
  'changelog',
  'cite',
  'community-guidelines',
  'contact',
  'contact-link',
  'contributors',
  'design',
  'docs',
  'documents',
  'download',
  'facebook-mockup',
  'games',
  'integrations',
  'invite',
  'legal',
  'login',
  'logout',
  'meet-together',
  'models',
  'onboarding',
  'partners',
  'pitch',
  'portfolio',
  'pricing',
  'privacy',
  'products',
  'qr-generator',
  'security',
  'share',
  'shared',
  'signup',
  'solutions',
  'sso',
  'terms',
  'u',
  'ui',
  'users',
  'verify-token',
  'visualizations',
  'women-in-tech',
]);

/** Route segments directly under `[wsId]` (route groups flattened). */
export const WORKSPACE_CHILD_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  'ai',
  'ai-chat',
  'api-keys',
  'billing',
  'calendar',
  'changelog',
  'crawlers',
  'cron',
  'datasets',
  'diet',
  'documents',
  'domains',
  'epm',
  'external-projects',
  'feedback',
  'habits',
  'hive',
  'inquiries',
  'integrations',
  'inventory',
  'link-shortener',
  'members',
  'memories',
  'metrics',
  'mind',
  'mira',
  'models',
  'notes',
  'notifications',
  'personal-journal',
  'pipelines',
  'polls',
  'progress',
  'qr-generator',
  'queues',
  'readings',
  'roles',
  'secrets',
  'settings',
  'sso',
  'tasks',
  'usage',
  'whiteboards',
  'workforce',
  'workouts',
  'workspace-setup',
]);

/** A workspace id that can only be a real workspace reference. */
export function isWorkspaceReferenceSegment(segment: string): boolean {
  const normalized = segment.toLowerCase();
  return (
    normalized === PERSONAL_WORKSPACE_SLUG ||
    normalized === INTERNAL_WORKSPACE_SLUG ||
    WORKSPACE_UUID.test(segment.trim())
  );
}

/**
 * True when a locale-free path matches no known route shape, so a signed-out
 * visitor should see the not-found page rather than be sent to login.
 * `segments` are the decoded path segments without the locale prefix.
 */
export function isUnknownRouteShape(segments: readonly string[]): boolean {
  const [first, second] = segments;
  if (!first) return false;
  // Framework, private and well-known segments keep their existing handling.
  if (/^[._~@]/u.test(first)) return false;
  if (KNOWN_ROOT_ROUTE_SEGMENTS.has(first)) return false;
  if (isWorkspaceReferenceSegment(first)) return false;
  if (second !== undefined && WORKSPACE_CHILD_ROUTE_SEGMENTS.has(second))
    return false;
  return true;
}

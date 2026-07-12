import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contactsOwnedRouteFiles = [
  '../users/groups/route.ts',
  '../users/groups/possible-excluded/route.ts',
  '../users/groups/featured-counts/route.ts',
  '../users/links/manual/route.ts',
  '../group-tags/route.ts',
  '../group-tags/[tagId]/route.ts',
  '../group-tags/[tagId]/user-groups/route.ts',
  '../group-tags/[tagId]/user-groups/[groupId]/route.ts',
  'route.ts',
  '[groupId]/route.ts',
  '[groupId]/attendance/route.ts',
  '[groupId]/indicators/route.ts',
  '[groupId]/indicators/[indicatorId]/route.ts',
  '[groupId]/indicators/categories/route.ts',
  '[groupId]/indicators/categories/[categoryId]/route.ts',
  '[groupId]/linked-products/route.ts',
  '[groupId]/linked-products/[productId]/route.ts',
  '[groupId]/members/route.ts',
  'activity-logs/route.ts',
  'sessions/route.ts',
  'sessions/[sessionId]/route.ts',
  'sessions/[sessionId]/reconcile/route.ts',
  'sessions/group-summaries/route.ts',
  'sessions/occurrences/route.ts',
  '../products/options/route.ts',
  '../settings/configs/route.ts',
  '../settings/[configId]/route.ts',
  '../../../users/me/profile/route.ts',
] as const;

describe('Contacts user-group API ownership', () => {
  it.each(
    contactsOwnedRouteFiles
  )('serves %s locally from the shared users-core handler', (relativePath) => {
    const routePath = resolve(import.meta.dirname, relativePath);
    const source = readFileSync(routePath, 'utf8');

    expect(source).toContain('@tuturuuu/users-core/routes/');
  });

  it('serves attendance reads and saves from Contacts', () => {
    const routePath = resolve(
      import.meta.dirname,
      '[groupId]/attendance/route.ts'
    );
    const source = readFileSync(routePath, 'utf8');

    expect(source).toMatch(/\bGET\b/u);
    expect(source).toMatch(/\bPOST\b/u);
  });
});

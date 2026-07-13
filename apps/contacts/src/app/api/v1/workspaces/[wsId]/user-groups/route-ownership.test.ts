import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contactsOwnedRouteFiles = [
  '../users/groups/route.ts',
  '../users/groups/possible-excluded/route.ts',
  '../users/groups/featured-counts/route.ts',
  '../users/reports/route.ts',
  '../users/reports/[reportId]/route.ts',
  '../users/reports/[reportId]/logs/route.ts',
  '../users/reports/groups/route.ts',
  '../users/reports/groups/[groupId]/dashboard/route.ts',
  '../users/reports/groups/[groupId]/bulk-export/route.ts',
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
  '[groupId]/members/[userId]/route.ts',
  '[groupId]/posts/route.ts',
  '[groupId]/posts/[postId]/route.ts',
  '[groupId]/posts/[postId]/status/route.ts',
  '[groupId]/group-checks/route.ts',
  '[groupId]/group-checks/[postId]/route.ts',
  '[groupId]/group-checks/[postId]/logs/route.ts',
  '[groupId]/group-checks/[postId]/email/route.ts',
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

  it.each([
    ['route.ts', ['GET', 'POST']],
    ['[groupId]/route.ts', ['GET', 'PUT', 'DELETE']],
    ['[groupId]/members/route.ts', ['GET', 'POST']],
    ['[groupId]/members/[userId]/route.ts', ['DELETE']],
    ['[groupId]/posts/route.ts', ['GET', 'POST']],
    ['[groupId]/posts/[postId]/route.ts', ['PUT', 'DELETE']],
    ['[groupId]/posts/[postId]/status/route.ts', ['GET']],
    ['[groupId]/group-checks/route.ts', ['GET', 'POST']],
    ['[groupId]/group-checks/[postId]/route.ts', ['PUT', 'DELETE']],
    ['[groupId]/group-checks/[postId]/logs/route.ts', ['GET']],
    ['[groupId]/group-checks/[postId]/email/route.ts', ['POST']],
  ] as const)('exports the expected CRUD methods from %s', (relativePath, methods) => {
    const routePath = resolve(import.meta.dirname, relativePath);
    const source = readFileSync(routePath, 'utf8');

    for (const method of methods) {
      expect(source).toMatch(new RegExp(`\\b${method}\\b`, 'u'));
    }
  });
});

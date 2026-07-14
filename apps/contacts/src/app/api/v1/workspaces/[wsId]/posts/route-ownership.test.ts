import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contactsOwnedPostRoutes = [
  ['route.ts', ['GET']],
  ['bootstrap/route.ts', ['GET']],
  ['filter-options/route.ts', ['GET']],
  ['permissions/route.ts', ['GET']],
] as const;

describe('Contacts workspace Posts API ownership', () => {
  it.each(
    contactsOwnedPostRoutes
  )('serves %s locally from the app-session-aware users-core handler', (relativePath, methods) => {
    const routePath = resolve(import.meta.dirname, relativePath);
    const source = readFileSync(routePath, 'utf8');

    expect(source).toContain('@tuturuuu/users-core/routes/posts/');
    for (const method of methods) {
      expect(source).toMatch(new RegExp(`\\b${method}\\b`, 'u'));
    }
  });
});

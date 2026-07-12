import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routes = [
  'route.ts',
  'unread-count/route.ts',
  '[id]/route.ts',
  '[id]/metadata/route.ts',
] as const;

describe('Contacts notification API ownership', () => {
  it.each(routes)('serves %s locally from Users Core', (relativePath) => {
    const source = readFileSync(
      resolve(import.meta.dirname, relativePath),
      'utf8'
    );
    expect(source).toContain('@tuturuuu/users-core/routes/notifications/');
  });
});

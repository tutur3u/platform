import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contactsOwnedApprovalRoutes = [
  ['route.ts', ['GET', 'PUT']],
  ['logs/route.ts', ['GET']],
] as const;

describe('Contacts workspace approvals API ownership', () => {
  it.each(
    contactsOwnedApprovalRoutes
  )('serves %s locally instead of matching users/[userId]', (relativePath, methods) => {
    const source = readFileSync(
      resolve(import.meta.dirname, relativePath),
      'utf8'
    );

    expect(source).toContain('@tuturuuu/users-core/routes/users/approvals/');
    for (const method of methods) {
      expect(source).toMatch(new RegExp(`\\b${method}\\b`, 'u'));
    }
  });
});

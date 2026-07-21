import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');

const infrastructureRoutes = [
  'apps/infrastructure/src/app/api/ai/translate/route.ts',
  'apps/infrastructure/src/app/api/v1/internal/holidays/route.ts',
  'apps/infrastructure/src/app/api/v1/internal/holidays/[holidayId]/route.ts',
  'apps/infrastructure/src/app/api/v1/internal/holidays/bulk/route.ts',
  'apps/infrastructure/src/app/api/workspaces/route.ts',
  'apps/infrastructure/src/app/api/workspaces/[wsId]/secrets/route.ts',
  'apps/infrastructure/src/app/api/workspaces/[wsId]/secrets/[secretId]/route.ts',
];

const retiredWebRoutes = [
  'apps/web/src/app/api/ai/translate/route.ts',
  'apps/web/src/app/api/v1/internal/holidays/route.ts',
  'apps/web/src/app/api/v1/internal/holidays/[holidayId]/route.ts',
  'apps/web/src/app/api/v1/internal/holidays/bulk/route.ts',
];

describe('infrastructure API ownership', () => {
  it('keeps Infrastructure UI dependencies local to the satellite', () => {
    for (const route of infrastructureRoutes) {
      expect(existsSync(resolve(repoRoot, route)), route).toBe(true);
    }
  });

  it('does not reintroduce Infrastructure-only APIs in Web', () => {
    for (const route of retiredWebRoutes) {
      expect(existsSync(resolve(repoRoot, route)), route).toBe(false);
    }
  });
});

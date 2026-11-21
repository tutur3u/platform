import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');

const infrastructureRoutes = [
  'apps/admin/src/app/api/ai/translate/route.ts',
  'apps/admin/src/app/api/v1/internal/holidays/route.ts',
  'apps/admin/src/app/api/v1/internal/holidays/[holidayId]/route.ts',
  'apps/admin/src/app/api/v1/internal/holidays/bulk/route.ts',
  'apps/admin/src/app/api/workspaces/route.ts',
  'apps/admin/src/app/api/workspaces/[wsId]/secrets/route.ts',
  'apps/admin/src/app/api/workspaces/[wsId]/secrets/[secretId]/route.ts',
  'apps/admin/src/app/api/v1/infrastructure/mira/tenants/route.ts',
  'apps/admin/src/app/api/v1/infrastructure/mira/tenants/[wsId]/stop/route.ts',
  'apps/admin/src/app/api/v1/infrastructure/mira/global-stop/route.ts',
  'apps/admin/src/app/api/v1/infrastructure/mira/audit/route.ts',
];

const retiredWebRoutes = [
  'apps/web/src/app/api/ai/translate/route.ts',
  'apps/web/src/app/api/v1/internal/holidays/route.ts',
  'apps/web/src/app/api/v1/internal/holidays/[holidayId]/route.ts',
  'apps/web/src/app/api/v1/internal/holidays/bulk/route.ts',
  // Mira operator routes are Admin-only; tenant routes never widen to them.
  'apps/web/src/app/api/v1/infrastructure/mira/tenants/route.ts',
  'apps/web/src/app/api/v1/infrastructure/mira/global-stop/route.ts',
  'apps/web/src/legacy-api-routes/v1/infrastructure/mira/tenants/route.ts',
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

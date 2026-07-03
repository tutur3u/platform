import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const callbackRouteSource = readFileSync(
  join(process.cwd(), 'src/app/api/v1/calendar/auth/callback/route.ts'),
  'utf8'
);
const fullSyncRouteSource = readFileSync(
  join(process.cwd(), 'src/app/api/v1/calendar/auth/full-sync/route.ts'),
  'utf8'
);

function staticImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]${escapedModulePath}['"];`,
    'mu'
  );
}

describe('Google Calendar auth route compile graph', () => {
  it('keeps Trigger/Electric full sync helpers behind runtime split points', () => {
    for (const source of [callbackRouteSource, fullSyncRouteSource]) {
      expect(source).not.toMatch(staticImportPattern('@tuturuuu/trigger'));
      expect(source).not.toMatch(
        staticImportPattern('@tuturuuu/trigger/google-calendar-full-sync')
      );
      expect(source).toMatch(
        /import\(\s*['"]@tuturuuu\/trigger\/google-calendar-full-sync['"]\s*\)/u
      );
    }
  });
});

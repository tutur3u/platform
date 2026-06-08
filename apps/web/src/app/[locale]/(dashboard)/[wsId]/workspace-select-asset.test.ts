import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceSelectSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx'
  ),
  'utf8'
);

describe('[wsId] workspace select assets', () => {
  it('uses the same-origin Tuturuuu logo fallback in apps/web', () => {
    expect(workspaceSelectSource).toContain('TUTURUUU_LOCAL_LOGO_URL');
    expect(workspaceSelectSource).toContain(
      'fallbackLogoUrl={TUTURUUU_LOCAL_LOGO_URL}'
    );
    expect(workspaceSelectSource).not.toContain('TUTURUUU_LOGO_URL');
    expect(workspaceSelectSource).not.toContain('TUTURUUU_REMOTE_LOGO_URL');
  });
});

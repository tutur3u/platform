import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

// These gates accepted @xwf.tuturuuu.com before the verified-identity helper.
// Every other staff gate stays exact @tuturuuu.com; widen only with review.
const XWF_GATES = [
  'apps/mail/src/app/api/ai/email-draft/route.ts',
  'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/send/route.ts',
  'apps/tasks/src/app/api/admin/tasks/embeddings/generate/route.ts',
  'apps/tasks/src/app/api/admin/tasks/embeddings/stats/route.ts',
  'apps/track/src/app/[locale]/(dashboard)/[wsId]/management/page.tsx',
  'apps/web/src/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/inquiries/page.tsx',
  'apps/web/src/app/[locale]/games/farm/layout.tsx',
  'apps/web/src/app/api/v1/inquiries/[id]/route.ts',
  'apps/web/src/app/api/v1/inquiries/route.ts',
  'apps/web/src/app/api/v1/workspaces/[wsId]/settings/permissions/route.ts',
  'apps/web/src/legacy-api-routes/v1/admin/ai/memory/backfill-mira/route.ts',
  'packages/utils/src/workspace-inquiries.ts',
  'packages/utils/src/workspace-limits.ts',
];

it('opts into xwf staff only at gates that already accepted it', () => {
  const output = execFileSync(
    'git',
    [
      'grep',
      '-l',
      '-F',
      'allowXwf',
      '--',
      ':(glob)apps/*/src/**/*.ts',
      ':(glob)apps/*/src/**/*.tsx',
      ':(glob)packages/*/src/**/*.ts',
      ':(glob)packages/*/src/**/*.tsx',
      ':!*.test.ts',
      ':!*.test.tsx',
    ],
    { cwd: `${__dirname}/../../../../..`, encoding: 'utf8' }
  );
  const gates = output
    .trim()
    .split('\n')
    .filter((path) => path !== 'packages/utils/src/email/staff-session.ts');
  expect(gates.sort()).toEqual([...XWF_GATES].sort());
}, 30_000);

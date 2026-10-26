const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  RULES,
  collectMatches,
  compareWithAllowlist,
  listScannedFiles,
} = require('./check-browser-session-surface.js');

test('flags browser Supabase client imports, static and dynamic', () => {
  assert.equal(
    RULES.browserSupabaseClientImports(
      "import { createClient } from '@tuturuuu/supabase/next/client';"
    ),
    true
  );
  assert.equal(
    RULES.browserSupabaseClientImports(
      "const { createClient } = await import('@tuturuuu/supabase/next/auth-browser');"
    ),
    true
  );
  assert.equal(
    RULES.browserSupabaseClientImports(
      "import { createClient } from '@tuturuuu/supabase/next/server';"
    ),
    false
  );
});

test('flags postgres_changes subscriptions but not prose about them', () => {
  assert.equal(
    RULES.postgresChangesSubscriptions(
      "channel.on('postgres_changes', { event: '*' }, handler);"
    ),
    true
  );
  assert.equal(
    RULES.postgresChangesSubscriptions(
      '// postgres_changes is not available here'
    ),
    false
  );
});

test('flags script access to session cookies only', () => {
  assert.equal(
    RULES.sessionCookieScriptAccess(
      "const raw = document.cookie.split('; ').find((c) => c.startsWith('sb-'));"
    ),
    true
  );
  assert.equal(
    RULES.sessionCookieScriptAccess(
      "document.cookie = 'sidebar_state=open; path=/';"
    ),
    false
  );
});

test('flags a refresh-token key in a file that builds responses', () => {
  assert.equal(
    RULES.sessionTokenResponses(
      'return NextResponse.json({ refresh_token: session.refresh_token });'
    ),
    true
  );
  assert.equal(
    RULES.sessionTokenResponses(
      'return { body: { session: { refreshToken } }, status: 200 };'.replace(
        'refreshToken }',
        'refreshToken: token }'
      )
    ),
    true
  );
  assert.equal(
    RULES.sessionTokenResponses(
      "await db.from('tokens').insert({ refresh_token: token });"
    ),
    false
  );
});

test('the allowlist only shrinks: new and stale entries both fail', () => {
  const allowlist = {
    browserSupabaseClientImports: ['apps/a/src/old.tsx', 'apps/a/src/gone.tsx'],
    postgresChangesSubscriptions: [],
    sessionCookieScriptAccess: [],
    sessionTokenResponses: [
      { file: 'apps/web/src/lib/auth/password.ts', reason: 'native only' },
      { file: 'apps/web/src/lib/auth/otp.ts' },
    ],
  };
  const matches = {
    browserSupabaseClientImports: ['apps/a/src/old.tsx', 'apps/a/src/new.tsx'],
    postgresChangesSubscriptions: [],
    sessionCookieScriptAccess: [],
    sessionTokenResponses: [
      'apps/web/src/lib/auth/password.ts',
      'apps/web/src/lib/auth/otp.ts',
    ],
  };

  assert.deepEqual(compareWithAllowlist(matches, allowlist), [
    {
      file: 'apps/a/src/new.tsx',
      kind: 'new',
      rule: 'browserSupabaseClientImports',
    },
    {
      file: 'apps/a/src/gone.tsx',
      kind: 'stale',
      rule: 'browserSupabaseClientImports',
    },
    {
      file: 'apps/web/src/lib/auth/otp.ts',
      kind: 'no-reason',
      rule: 'sessionTokenResponses',
    },
  ]);
});

test('scans app and package sources but skips tests and paused runtimes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-surface-'));
  const write = (relative, content = '') => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  const browserImport =
    "import { createClient } from '@tuturuuu/supabase/next/client';";

  write('apps/web/src/page.tsx', browserImport);
  write('apps/web/src/page.test.tsx', browserImport);
  write('apps/web/src/__tests__/helper.ts', browserImport);
  write('apps/tanstack-web/src/page.tsx', browserImport);
  write('packages/ui/src/hook.ts', browserImport);

  const files = listScannedFiles(root);
  assert.deepEqual(files, ['apps/web/src/page.tsx', 'packages/ui/src/hook.ts']);
  assert.deepEqual(
    collectMatches(files, (file) =>
      fs.readFileSync(path.join(root, file), 'utf8')
    ).browserSupabaseClientImports,
    ['apps/web/src/page.tsx', 'packages/ui/src/hook.ts']
  );
});

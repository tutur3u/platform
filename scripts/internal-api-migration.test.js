const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

test('internal-api package exists with exported client entrypoint', () => {
  const packageJson = JSON.parse(read('packages/internal-api/package.json'));

  assert.equal(packageJson.name, '@tuturuuu/internal-api');
  assert.equal(packageJson.exports['./client'], './src/client.ts');
});

test('migrated shared hooks no longer import the deprecated Supabase browser client', () => {
  const migratedFiles = [
    'apps/web/src/hooks/use-wallets.ts',
    'apps/web/src/hooks/use-transaction-categories.ts',
    'packages/ui/src/hooks/use-user-config.ts',
    'packages/ui/src/hooks/use-workspace-members.ts',
    'apps/track/src/app/[locale]/(dashboard)/[wsId]/components/workspace-select-dialog.tsx',
  ];

  for (const file of migratedFiles) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /@tuturuuu\/supabase\/next\/client/,
      `Expected ${file} to stop importing @tuturuuu/supabase/next/client`
    );
    assert.match(
      source,
      /@tuturuuu\/internal-api\//,
      `Expected ${file} to import the shared internal API package`
    );
  }
});

test('nova falls back unmatched API routes to the central web app', () => {
  const source = read('apps/nova/next.config.ts');

  assert.match(
    source,
    /const CENTRAL_PORT = process\.env\.CENTRAL_PORT \|\| 7803;/
  );
  assert.match(source, /fallback:\s*\[/);
  assert.match(source, /destination:\s*`\$\{WEB_APP_URL\}\/api\/:path\*`/);
});

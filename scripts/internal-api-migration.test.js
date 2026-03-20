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
    'apps/calendar/src/components/settings/settings-dialog.tsx',
    'apps/finance/src/components/settings/settings-dialog.tsx',
    'apps/rewise/src/components/settings/settings-dialog.tsx',
    'apps/tasks/src/components/settings/settings-dialog.tsx',
    'packages/ui/src/hooks/use-user-config.ts',
    'packages/ui/src/hooks/use-workspace-members.ts',
    'packages/ui/src/hooks/use-workspace-user.ts',
    'packages/ui/src/hooks/use-workspace-permission.ts',
    'apps/web/src/lib/calendar-preferences-provider.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/inventory/promotions/settings-form.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/posts/filters.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/mail/client.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/(dashboard)/permission-setup-banner.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/(dashboard)/components/mira-model-selector/use-mira-model-selector-data.ts',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/linker.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/row-actions.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/content/content-editor.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/client-quizzes.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/flashcards/client-flashcards.tsx',
    'packages/ui/src/components/ui/custom/education/modules/module-toggle.tsx',
    'packages/ui/src/components/ui/custom/education/modules/resources/delete-resource.tsx',
    'packages/ui/src/components/ui/custom/education/modules/resources/file-display.tsx',
    'packages/ui/src/components/ui/custom/education/modules/youtube/delete-link-button.tsx',
    'packages/ui/src/components/ui/finance/transactions/category-filter.tsx',
    'packages/ui/src/components/ui/finance/transactions/user-filter.tsx',
    'packages/ui/src/components/ui/finance/transactions/period-charts/category-donut-chart.tsx',
    'packages/ui/src/components/ui/finance/transactions/period-charts/category-breakdown-dialog.tsx',
    'packages/ui/src/components/ui/finance/transactions/period-charts/period-breakdown-panel.tsx',
    'packages/ui/src/components/ui/finance/analytics/spending-trends-chart.tsx',
    'packages/ui/src/components/ui/finance/analytics/category-spending-chart.tsx',
    'packages/ui/src/components/ui/finance/recurring/form.tsx',
    'packages/ui/src/components/ui/finance/recurring/recurring-transactions-page.tsx',
    'packages/ui/src/components/ui/finance/wallets/walletId/wallet-role-access.tsx',
    'packages/ui/src/components/ui/legacy/calendar/settings/hour-settings.tsx',
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

test('non-web apps fall back unmatched API routes to the central web app', () => {
  const apps = [
    'apps/calendar/next.config.ts',
    'apps/external/next.config.ts',
    'apps/finance/next.config.ts',
    'apps/meet/next.config.ts',
    'apps/nova/next.config.ts',
    'apps/playground/next.config.ts',
    'apps/rewise/next.config.ts',
    'apps/shortener/next.config.ts',
    'apps/tasks/next.config.ts',
    'apps/track/next.config.ts',
  ];

  for (const file of apps) {
    const source = read(file);

    assert.match(
      source,
      /const CENTRAL_PORT = process\.env\.CENTRAL_PORT \|\| 7803;/
    );
    assert.match(source, /fallback:\s*\[/);
    assert.match(source, /destination:\s*`\$\{WEB_APP_URL\}\/api\/:path\*`/);
  }
});

test('shared satellite logout uses the auth-only browser client', () => {
  const source = read('packages/satellite/src/components/user-nav-client.tsx');

  assert.match(source, /@tuturuuu\/supabase\/next\/auth-browser/);
  assert.doesNotMatch(source, /@tuturuuu\/supabase\/next\/client/);
});

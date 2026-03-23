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
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/documents/[documentId]/document-editor.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/drive/file-preview-dialog.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/drive/row-actions.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/drive/table.tsx',
    'packages/ui/src/components/ui/custom/education/modules/module-toggle.tsx',
    'packages/ui/src/components/ui/custom/education/modules/resources/delete-resource.tsx',
    'packages/ui/src/components/ui/custom/education/modules/resources/file-display.tsx',
    'packages/ui/src/components/ui/custom/education/modules/youtube/delete-link-button.tsx',
    'packages/ui/src/components/ui/finance/transactions/transactionId/bill.tsx',
    'packages/ui/src/components/ui/finance/transactions/transactionId/row-actions.tsx',
    'packages/ui/src/components/ui/finance/transactions/category-filter.tsx',
    'packages/ui/src/components/ui/finance/transactions/user-filter.tsx',
    'packages/ui/src/components/ui/finance/transactions/period-charts/category-donut-chart.tsx',
    'packages/ui/src/components/ui/finance/transactions/period-charts/category-breakdown-dialog.tsx',
    'packages/ui/src/components/ui/finance/transactions/period-charts/period-breakdown-panel.tsx',
    'packages/ui/src/components/ui/finance/analytics/spending-trends-chart.tsx',
    'packages/ui/src/components/ui/finance/analytics/category-spending-chart.tsx',
    'packages/ui/src/components/ui/finance/recurring/form.tsx',
    'packages/ui/src/components/ui/finance/recurring/recurring-transactions-page.tsx',
    'packages/ui/src/components/ui/calendar-app/components/quick-task-dialog.tsx',
    'packages/ui/src/components/ui/calendar-app/components/task-form.tsx',
    'packages/ui/src/components/ui/calendar-app/components/task-list-form.tsx',
    'packages/ui/src/components/ui/finance/wallets/walletId/wallet-role-access.tsx',
    'packages/ui/src/components/ui/legacy/calendar/settings/hour-settings.tsx',
    'packages/ui/src/components/ui/tu-do/boards/boardId/task-form.tsx',
    'packages/ui/src/components/ui/tu-do/boards/workspace-projects-client-page.tsx',
    'packages/ui/src/components/ui/tu-do/drafts/draft-convert-dialog.tsx',
    'packages/ui/src/components/ui/tu-do/my-tasks/task-list-with-completion.tsx',
    'packages/ui/src/components/ui/tu-do/my-tasks/use-my-tasks-state.ts',
    'packages/ui/src/components/ui/tu-do/my-tasks/use-task-context-actions.ts',
    'apps/track/src/app/[locale]/(dashboard)/[wsId]/components/workspace-select-dialog.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/time-tracker/components/use-workspace-tasks.ts',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/time-tracker/components/time-tracker-content.tsx',
    'apps/track/src/app/[locale]/(dashboard)/[wsId]/components/use-workspace-tasks.ts',
    'apps/track/src/app/[locale]/(dashboard)/[wsId]/components/time-tracker-content.tsx',
    'apps/web/src/app/[locale]/(marketing)/contact/page.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/inquiries/inquiry-detail-modal.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/calendar/components/task-form.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/calendar/components/task-list-form.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/calendar/components/priority-view.tsx',
    'packages/ui/src/components/ui/calendar-app/components/priority-view.tsx',
    'apps/web/src/app/[locale]/(dashboard)/[wsId]/ai-chat/chat.tsx',
    'apps/rewise/src/app/[locale]/(dashboard)/[wsId]/structure.tsx',
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
      /@tuturuuu\/(internal-api(?:\/|')|utils\/task-helper')/,
      `Expected ${file} to import the shared internal API package or helper wrapper`
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

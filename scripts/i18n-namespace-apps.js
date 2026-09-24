// Shared packages that may reference translation namespaces
const SHARED_PACKAGES = [
  { name: 'packages/meet-core', dir: 'packages/meet-core/src/features' },
  { name: 'packages/ui', dir: 'packages/ui/src' },
  { name: 'packages/tasks-ui', dir: 'packages/tasks-ui/src' },
  { name: 'packages/satellite', dir: 'packages/satellite/src' },
  { name: 'packages/mind-ui', dir: 'packages/mind-ui/src' },
  { name: 'packages/hive-ui', dir: 'packages/hive-ui/src' },
];

// Apps with translation files to check
const APPS = [
  { name: 'apps/colab', dir: 'apps/colab' },
  { name: 'apps/web', dir: 'apps/web' },
  { name: 'apps/tasks', dir: 'apps/tasks' },
  { name: 'apps/calendar', dir: 'apps/calendar' },
  { name: 'apps/cms', dir: 'apps/cms' },
  { name: 'apps/contacts', dir: 'apps/contacts' },
  { name: 'apps/forms', dir: 'apps/forms' },
  { name: 'apps/lettin', dir: 'apps/lettin' },
  { name: 'apps/git', dir: 'apps/git' },
  { name: 'apps/drive', dir: 'apps/drive' },
  { name: 'apps/finance', dir: 'apps/finance' },
  { name: 'apps/hive', dir: 'apps/hive' },
  { name: 'apps/inventory', dir: 'apps/inventory' },
  { name: 'apps/meet', dir: 'apps/meet' },
  { name: 'apps/parley', dir: 'apps/parley' },
  { name: 'apps/mind', dir: 'apps/mind' },
  { name: 'apps/track', dir: 'apps/track' },
  { name: 'apps/nova', dir: 'apps/nova' },
  { name: 'apps/rewise', dir: 'apps/rewise' },
  { name: 'apps/storefront', dir: 'apps/storefront' },
  { name: 'apps/shortener', dir: 'apps/shortener' },
];

module.exports = { APPS, SHARED_PACKAGES };

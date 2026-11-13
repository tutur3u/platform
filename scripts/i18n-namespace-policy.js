// Minimal apps that render only a small slice of the shared UI. Instead of the
// default "every shared namespace is required minus a long exception list",
// restrict the cross-app check for these apps to ONLY the listed namespaces —
// the shared UI they actually render (the account menu / dialogs use `common`).
// All other shared namespaces are implicitly ignored for the app.
const APP_NAMESPACE_ALLOWLIST = new Map([
  ['apps/inventory', new Set(['ws-members', 'ws-roles'])],
  [
    'apps/git',
    new Set([
      'account_switcher',
      'command_launcher',
      'common',
      'nav-upgrade-dialog',
      'notifications',
      'settings',
      'settings-account',
      'version-badge',
    ]),
  ],
  // Colab uses framework-independent primitives with labels supplied by its own locale context.
  ['apps/colab', new Set()],
  // Roadmap's public shell and primitives receive labels from its locale dictionaries.
  ['apps/roadmap', new Set()],
  ['apps/storefront', new Set(['common'])],
  ['apps/shortener', new Set(['common'])],
  // Marketing's public site imports only label-free shared primitives (buttons,
  // accordion, logo, theme toggle, price and comparison tables); copy comes from
  // its own message bundle, which keeps the account/common namespace.
  ['apps/marketing', new Set(['common'])],
]);

// Apps that ship message bundles and depend on shared UI but are intentionally
// NOT wired into the cross-app namespace check yet. Listed explicitly so the
// drift guard below does not silently skip them — adding a new app forces a
// conscious choice (wire it into APPS, or record it here). Remove an entry when
// you move the app into APPS.
const UNCHECKED_APPS = new Set([
  'apps/ai',
  'apps/apps',
  'apps/chat',
  'apps/infrastructure',
  'apps/learn',
  'apps/mail',
  'apps/pay',
  'apps/tools',
  'apps/teach',
]);

// Some satellite apps consume broad shared UI packages directly but only ship a
// narrow product namespace bundle. Keep their parity checks scoped to the
// shared product UI package that must render in both the satellite and apps/web.
const APP_SHARED_PACKAGE_SCOPES = new Map([
  ['apps/hive', new Set(['packages/hive-ui'])],
  ['apps/mind', new Set(['packages/mind-ui'])],
]);

// Bare root-qualified keys in shared packages need app-level rollout scopes:
// `useTranslations()` has no namespace signal, and packages/ui is too broad to
// require every app to carry every root key it contains. Add namespaces here as
// their consuming apps are confirmed.
const SATELLITE_WORKSPACE_SETTINGS_APPS = new Set([
  'apps/calendar',
  'apps/cms',
  'apps/contacts',
  'apps/forms',
  'apps/drive',
  'apps/finance',
  'apps/inventory',
  'apps/rewise',
  'apps/tasks',
  'apps/track',
  'apps/web',
]);

const BARE_ROOT_KEY_APP_SCOPES = new Map([
  ['ws-members', SATELLITE_WORKSPACE_SETTINGS_APPS],
  ['ws-roles', SATELLITE_WORKSPACE_SETTINGS_APPS],
  ['ws-invoices', new Set(['apps/finance'])],
  ['ws-task-boards', new Set(['apps/tasks', 'apps/web'])],
]);

// Apps that render the FULL shared dashboard shell (sidebar, user nav,
// workspace select, settings dialog, upgrade dialog) and therefore must carry
// every bare root-qualified key the shared packages can request — not just the
// namespaces enumerated in BARE_ROOT_KEY_APP_SCOPES above.
//
// Those shell components all read their strings via a bare `useTranslations()`
// (see packages/satellite .../user-nav-client.tsx, sidebar-structure-header.tsx
// and packages/ui .../custom/workspace-select.tsx, settings-dialog-shell.tsx).
// A bare translator carries no namespace signal, so without an entry here the
// key-level scan skips those keys for EVERY app — which is how apps/contacts
// shipped to production missing `common.dashboard`, `common.logout`,
// `nav-upgrade-dialog.*`, `settings.back_to_app`, and 850+ more: the namespace
// check passed (contacts had `common`) while the namespace was half-empty, and
// the misses only surfaced as runtime MISSING_MESSAGE errors.
//
// Use `keyExceptions` to opt a full-scope app out of namespaces belonging to
// product surfaces it does not render.
const BARE_ROOT_KEY_FULL_SCOPE_APPS = new Set([
  'apps/contacts',
  'apps/forms',
  'apps/git',
]);

// Namespaces that must stay in parity across the apps that render the shared
// component using them.
//
// The workspace-access component (packages/ui .../custom/workspace-access)
// renders members/roles/defaults in both apps/web and apps/cms and reads its
// strings via a bare `useTranslations()` (no namespace argument), plus the
// permission catalog in packages/utils. Typed translator helpers inside the
// scanned shared packages are covered by the source-key scanner; the external
// permission catalog still needs parity coverage here.
//
// Only apps that actually render the component are listed — most apps carry a
// (historically duplicated) ws-roles/ws-members namespace but never render it,
// so requiring these keys everywhere would be pure noise. Each group requires
// every listed app to contain every key any peer app has, per namespace.
const NAMESPACE_PARITY_GROUPS = [
  {
    apps: ['apps/web', 'apps/cms'],
    namespaces: ['ws-roles', 'ws-members'],
  },
];

module.exports = {
  APP_NAMESPACE_ALLOWLIST,
  UNCHECKED_APPS,
  APP_SHARED_PACKAGE_SCOPES,
  SATELLITE_WORKSPACE_SETTINGS_APPS,
  BARE_ROOT_KEY_APP_SCOPES,
  BARE_ROOT_KEY_FULL_SCOPE_APPS,
  NAMESPACE_PARITY_GROUPS,
};

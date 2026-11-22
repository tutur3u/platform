// Translation checks that read source as well as message bundles. Each one
// follows what an app renders, through its own files and the shared packages
// it imports, and fails when a key or namespace it needs is missing from that
// app's bundles. A source change can therefore break them without touching a
// bundle: a new `useTranslations` call, a new import of a translated shared
// component, or a new app. They are the three commands of the "Namespace
// Check" job in .github/workflows/i18n-check.yaml and need no install or
// build; the two rendered-key guards use Bun's transpiler to scan imports.

const { selectLocalChecks } = require('../ci/check-map.js');

const FIX =
  "add the key or namespace to that app's messages/en.json and vi.json, then run `bun i18n:sort`";

/** Run from the repository root, in the order the CI job runs them. */
const I18N_USAGE_CHECKS = [
  {
    id: 'i18n-rendered-keys',
    label: 'i18n rendered keys',
    command: 'bun',
    args: ['scripts/i18n-rendered-keys.js'],
    fixHint: `A rendered translation key is missing: ${FIX}.`,
  },
  {
    id: 'i18n-rendered-settings',
    label: 'i18n rendered settings keys',
    command: 'bun',
    args: ['scripts/i18n-rendered-settings.js'],
    fixHint: `A shared settings key is missing or untraced: ${FIX}.`,
  },
  {
    id: 'i18n-namespace',
    label: 'i18n namespaces (shared -> apps)',
    command: 'node',
    args: ['scripts/i18n-namespace-check.js'],
    fixHint: `A shared namespace is missing or an app is unregistered: ${FIX}, or register the app in scripts/i18n-namespace-apps.js.`,
  },
];

/** The translation usage checks as gate steps, when the map selects them. */
function i18nUsageSteps(selected) {
  return selected.has('i18n-usage')
    ? I18N_USAGE_CHECKS.map((check) => ({ ...check, args: [...check.args] }))
    : [];
}

/** Where the checks read source and bundles, as git pathspecs. */
const I18N_USAGE_ROOTS = ['apps', 'packages'];
const NOTE_LIMIT = 10;

/**
 * The checks read every app and shared package in the working tree, so an
 * untracked file can fail a push that does not contain it, or satisfy an
 * import that CI cannot resolve. The pre-push hook does not refuse up front
 * for these, so the presence of other work in a shared checkout does not
 * block a push; a check that fails still fails it, and CI decides.
 * Returns the line that names untracked paths the checks may read (matched by
 * path, whether or not anything imports them), or null when the checks are
 * not planned or no such path exists. `tryGit` runs git with the given
 * arguments and returns its output, or null when the command fails.
 */
function i18nUsageUntrackedNote(steps, tryGit) {
  const ids = new Set(I18N_USAGE_CHECKS.map((check) => check.id));
  if (!steps.some((step) => ids.has(step.id))) return null;
  const listed = tryGit([
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    ...I18N_USAGE_ROOTS,
  ]);
  const files = (listed ?? '')
    .split('\0')
    .filter((file) => file && selectLocalChecks([file]).has('i18n-usage'));
  if (!files.length) return null;
  const named = files.slice(0, NOTE_LIMIT).map((file) => JSON.stringify(file));
  const rest = files.length - named.length;
  return `  note: the translation checks may read untracked files the push does not contain, so their result can differ from CI: ${named.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
}

module.exports = {
  I18N_USAGE_CHECKS,
  I18N_USAGE_ROOTS,
  i18nUsageSteps,
  i18nUsageUntrackedNote,
};

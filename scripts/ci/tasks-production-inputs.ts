// Repository paths beyond apps/tasks whose changes select the Tasks Worker
// production publisher: its workflows, sealed-artifact tooling, the cf
// upload and the shared cf Void publisher modules. Entries ending in `-` or
// `/` are prefixes.
export const tasksProductionInputs = [
  '.github/workflows/mail-calendar-tasks-builds.yaml',
  'scripts/ci/apps-native-artifact.py',
  'scripts/ci/tasks-',
  'scripts/ci/void-cf-',
  'scripts/ci/wave1-cf-output.mjs',
  'scripts/ci/cf-build-output-publisher.mjs',
  'scripts/safe-fs.js',
  'scripts/native-cutover/smoke-checks.mjs',
];

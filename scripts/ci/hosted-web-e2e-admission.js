const KEYS = Object.freeze([
  'CI',
  'GITHUB_REPOSITORY',
  'GITHUB_WORKFLOW_REF',
  'GITHUB_REF',
  'RUNNER_ENVIRONMENT',
  'RUNNER_OS',
  'GITHUB_EVENT_NAME',
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
]);
const WORKFLOW =
  'tutur3u/platform/.github/workflows/e2e-smoke-report-only.yaml@refs/heads/main';
const BUILD_CONTEXT_KEY = 'DOCKER_WEB_E2E_ADMISSION';

function isNumeric(value) {
  return (
    typeof value === 'string' &&
    /^[0-9]+$/u.test(value) &&
    !/[^0-9]/u.test(value)
  );
}

function assertAdmission(env) {
  if (
    env.CI !== 'true' ||
    env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
    env.GITHUB_WORKFLOW_REF !== WORKFLOW ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    env.RUNNER_OS !== 'Linux' ||
    !['push', 'schedule', 'workflow_dispatch'].includes(
      env.GITHUB_EVENT_NAME
    ) ||
    !isNumeric(env.GITHUB_RUN_ID) ||
    !isNumeric(env.GITHUB_RUN_ATTEMPT)
  ) {
    throw new Error(
      'Docker exception is limited to the trusted main Web E2E fleet workflow'
    );
  }
}
function admissionContext(env) {
  if (!KEYS.some((key) => key !== 'CI' && env[key] !== undefined)) return {};
  assertAdmission(env);
  return Object.fromEntries(KEYS.map((key) => [key, env[key]]));
}
function buildAdmissionContext(env) {
  const raw = env[BUILD_CONTEXT_KEY];
  if (raw === undefined) return {};
  let context;
  try {
    if (typeof raw !== 'string') throw new Error();
    context = JSON.parse(raw);
    if (
      !context ||
      Array.isArray(context) ||
      Object.keys(context).length !== KEYS.length ||
      !KEYS.every((key) => Object.hasOwn(context, key))
    )
      throw new Error();
  } catch {
    throw new Error('Invalid hosted Web E2E build context');
  }
  assertAdmission(context);
  return context;
}
function ensureLocalE2EEnvFile(envFilePath, overrides = {}, env = process.env) {
  const fs = require('node:fs');
  const path = require('node:path');
  const { createLocalE2EEnvFileContent } = require('../e2e-local-environment');
  const context = admissionContext(env);
  const metadata = Object.keys(context).length
    ? { [BUILD_CONTEXT_KEY]: JSON.stringify(context) }
    : {};
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    createLocalE2EEnvFileContent({ ...overrides, ...metadata }),
    { encoding: 'utf8', mode: 0o600 }
  );
}
module.exports = {
  BUILD_CONTEXT_KEY,
  assertAdmission,
  admissionContext,
  buildAdmissionContext,
  ensureLocalE2EEnvFile,
};

const assert = require('node:assert/strict');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

// A variable or secret whose name carries a GitHub environment's identifier
// (`playground-production` -> `PLAYGROUND_PRODUCTION_*`) lives in that
// environment. A job that does not bind the environment reads it as empty,
// so every such reference must sit in a job bound to that environment.
// It reads `vars.NAME` and `secrets.NAME` references in jobs whose
// environment is a literal; indexed access, `secrets: inherit` into reusable
// workflows and expression-valued environments are outside its reach.
function environmentName(job) {
  const value =
    typeof job.environment === 'object' && job.environment !== null
      ? job.environment.name
      : job.environment;
  return typeof value === 'string' && !value.includes('${{') ? value : null;
}

// Repository-level switches whose names happen to start with an environment's
// identifier; their gate jobs read them before any environment is bound.
// Moving one into its environment would break that gate, so keep this list
// to switches that are deliberately repository-level.
const REPOSITORY_LEVEL = new Set([
  'DESKTOP_BETA_ENABLED', // desktop-beta.yaml release-status
  'DESKTOP_BETA_PLATFORMS', // desktop-beta.yaml release-status
  'UPSKII_PRODUCTION_E2E_ENABLED', // upskii-production-e2e.yaml gate
]);

const prefix = (environment) =>
  `${environment.toUpperCase().replaceAll('-', '_')}_`;

function references(job) {
  const text = JSON.stringify(job);
  return [...text.matchAll(/\b(?:vars|secrets)\.([A-Z0-9_]+)/gu)].map(
    ([, name]) => name
  );
}

function violations(workflows) {
  const environments = new Set();
  for (const workflow of Object.values(workflows))
    for (const job of Object.values(workflow?.jobs ?? {})) {
      const name = environmentName(job);
      if (name) environments.add(name);
    }
  const found = [];
  for (const [file, workflow] of Object.entries(workflows))
    for (const [jobId, job] of Object.entries(workflow?.jobs ?? {})) {
      const bound = environmentName(job);
      for (const name of references(job)) {
        if (REPOSITORY_LEVEL.has(name)) continue;
        for (const environment of environments)
          if (name.startsWith(prefix(environment)) && bound !== environment)
            found.push(
              `${file} ${jobId}: ${name} needs environment ${environment}`
            );
      }
    }
  return found;
}

test('environment-scoped variables and secrets are read only inside their environment', () => {
  assert.deepEqual(violations(readAllWorkflows(undefined, { raw: true })), []);
});

test('a job outside the environment that reads its variable is reported', () => {
  const workflows = {
    'deploy.yaml': {
      jobs: {
        build: {
          steps: [{ env: { ORIGIN: '${{ vars.APP_PRODUCTION_ORIGIN }}' } }],
        },
        deploy: {
          environment: 'app-production',
          steps: [{ env: { TOKEN: '${{ secrets.APP_PRODUCTION_TOKEN }}' } }],
        },
      },
    },
  };
  assert.deepEqual(violations(workflows), [
    'deploy.yaml build: APP_PRODUCTION_ORIGIN needs environment app-production',
  ]);
});

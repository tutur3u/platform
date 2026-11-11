const HOST_LABELS = ['studio', 'i9', 'm3', 'm4', 'skr-linux'].map(
  (host) => `ttr-selfhosted-${host}`
);
const TRUST_GUARD =
  "github.event_name == 'pull_request' && github.event.pull_request.head.repo.id == github.event.pull_request.base.repo.id && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.base.repo.full_name == github.repository";
const ROUTE = `\${{ ${TRUST_GUARD} && contains(fromJSON('${JSON.stringify(HOST_LABELS)}'), vars.CI_VALIDATION_RUNNER) && fromJSON(format('["self-hosted","{0}"]', vars.CI_VALIDATION_RUNNER)) || 'ubuntu-latest' }}`;
const OWNERS = new Set([
  'type-check.yaml:type-check-pr',
  'turbo-unit-tests.yaml:test-shards-pr',
]);

function lintSelfHostedWorkflows(workflows) {
  const errors = [];
  for (const [file, workflow] of Object.entries(workflows)) {
    for (const [id, job] of Object.entries(workflow.jobs || {})) {
      const route = JSON.stringify(job['runs-on'] || '');
      if (
        !route.includes('ttr-selfhosted-') &&
        !route.includes('CI_VALIDATION_RUNNER')
      )
        continue;
      const key = `${file}:${id}`;
      const reject = (reason) => errors.push(`${key}: ${reason}`);
      if (!OWNERS.has(key))
        reject(
          'runner routing is restricted to Test and Type Check PR variants'
        );
      if (job['runs-on'] !== ROUTE)
        reject(
          'missing exact same-repository PR guard or runner label allowlist'
        );
      if (
        JSON.stringify(job.permissions) !== JSON.stringify({ contents: 'read' })
      )
        reject('permissions must be exactly contents: read');
      if (!String(job.if).includes("github.event_name == 'pull_request'"))
        reject('job must be PR-only; pushes retain hosted coverage');
      if (
        /secrets\b|id-token|TURBO_TOKEN|TURBO_TEAM/.test(
          JSON.stringify([workflow.env, job])
        )
      )
        reject('credentials are forbidden');
      if (job.environment || job.services || job.container)
        reject('privileged execution context is forbidden');
      for (const step of job.steps || []) {
        if (/^actions\/cache@/.test(step.uses || ''))
          reject('cache writes are forbidden');
        if (
          step.uses === './.github/actions/setup-bun-with-retry' &&
          step.with?.['cache-enabled'] !==
            "${{ runner.environment != 'self-hosted' }}"
        )
          reject('persistent Bun cache must be disabled');
        if (
          /^actions\/checkout@/.test(step.uses || '') &&
          ![false, "${{ runner.environment != 'self-hosted' }}"].includes(
            step.with?.['persist-credentials']
          )
        )
          reject('checkout credentials must not persist');
      }
    }
  }
  return errors;
}
module.exports = { HOST_LABELS, ROUTE, lintSelfHostedWorkflows };

if (require.main === module) {
  const { readAllWorkflows } = require('./workflow-yaml-test-helper');
  const errors = lintSelfHostedWorkflows(
    readAllWorkflows(undefined, { raw: true })
  );
  for (const error of errors) console.error(error);
  process.exitCode = errors.length ? 1 : 0;
}

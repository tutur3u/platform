const hostedLabel =
  /^(?:ubuntu|macos|windows)-(?:latest|\d+(?:\.\d+)?)(?:-arm)?$|^xcode-27$/u;

function runnerLabels(file, job, desktopPlatforms) {
  const route = job['runs-on'];
  if (route === '${{ matrix.os }}') {
    const matrix = job.strategy?.matrix;
    if (!Array.isArray(matrix?.os) || !matrix.os.length) return [];
    return [
      ...matrix.os,
      ...(matrix.include || []).flatMap((row) =>
        Object.hasOwn(row, 'os') ? [row.os] : []
      ),
    ];
  }
  if (
    file === 'desktop-beta.yaml' &&
    route === '${{ matrix.runner }}' &&
    job.strategy?.matrix ===
      '${{ fromJSON(needs.release-status.outputs.matrix) }}'
  ) {
    return Object.values(desktopPlatforms).map(({ runner }) => runner);
  }
  if (
    route ===
    "${{ github.event_name == 'workflow_dispatch' && inputs.target == 'ios' && 'macos-15' || 'ubuntu-latest' }}"
  ) {
    return ['macos-15', 'ubuntu-latest'];
  }
  return [route];
}

async function lintSelfHostedWorkflows(workflows) {
  const { DESKTOP_PLATFORMS } =
    await import('../desktop-deployment/platforms.mjs');
  const errors = [];
  // Scan reusable callees and every direct job. The hosted-only policy also
  // covers forks and PR-target without relying on caller or job conditions.
  for (const [file, workflow] of Object.entries(workflows)) {
    for (const [id, job] of Object.entries(workflow.jobs || {})) {
      if (!Object.hasOwn(job, 'runs-on')) continue;
      const labels = runnerLabels(file, job, DESKTOP_PLATFORMS);
      if (!labels.length || labels.some((label) => !hostedLabel.test(label))) {
        errors.push(
          `${file}:${id}: runs-on must select a GitHub-hosted runner`
        );
      }
    }
  }
  return errors;
}

module.exports = { lintSelfHostedWorkflows };

async function main() {
  const { readAllWorkflows } = require('./workflow-yaml-test-helper');
  const errors = await lintSelfHostedWorkflows(
    readAllWorkflows(undefined, { raw: true })
  );
  for (const error of errors) console.error(error);
  process.exitCode = errors.length ? 1 : 0;
}

if (require.main === module) main();

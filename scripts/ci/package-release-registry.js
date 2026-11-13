const { spawnSync } = require('node:child_process');

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

function packageVersionExists({
  npmCommand = 'npm',
  packageName,
  packageVersion,
  registry = DEFAULT_REGISTRY,
}) {
  const result = spawnSync(
    npmCommand,
    [
      'view',
      `${packageName}@${packageVersion}`,
      'version',
      '--registry',
      registry,
    ],
    {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );

  return result.status === 0;
}

module.exports = { DEFAULT_REGISTRY, packageVersionExists };

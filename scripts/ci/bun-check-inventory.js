const fs = require('node:fs');
const path = require('node:path');
const { typeCheckProjects } = require('../check-changed/type-check.js');
const { PAUSED_APP_DIRECTORIES } = require('../paused-runtimes.js');

function inventory(root) {
  const manifests = ['package.json'];
  for (const parent of ['apps', 'packages']) {
    for (const entry of fs.readdirSync(path.join(root, parent), {
      withFileTypes: true,
    })) {
      const file = `${parent}/${entry.name}/package.json`;
      if (entry.isDirectory() && fs.existsSync(path.join(root, file)))
        manifests.push(file);
    }
  }
  return manifests.sort().map((file) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const workspace = path.posix.dirname(file);
    const scripts = manifest.scripts ?? {};
    const selected = Object.fromEntries(
      Object.entries(scripts).filter(
        ([name, command]) =>
          name === 'check' ||
          name === 'validate' ||
          name === 'validate:now' ||
          name.startsWith('type-check') ||
          /\b(?:tsc|tsgo|tsrs)\b|run-tsc-build/.test(command)
      )
    );
    const projects =
      workspace === '.' ? [] : typeCheckProjects(workspace, scripts);
    // Meet's declaration producer wraps run-tsc-build --build in a custom cache.
    if (workspace === 'apps/meet') projects.push('apps/meet/tsconfig.json');
    return {
      file,
      name: manifest.name,
      paused:
        workspace.startsWith('apps/') &&
        PAUSED_APP_DIRECTORIES.has(path.posix.basename(workspace)),
      scripts: selected,
      projects,
      emitsOrGenerates:
        Object.values(selected).some((command) =>
          /run-tsc-build|--build|wrangler types/.test(command)
        ) || projects.some((project) => /tsconfig\.build\.json$/.test(project)),
      customProducer: workspace === 'apps/meet',
    };
  });
}

function assertNoCheckScripts(entries) {
  const collisions = entries.filter((entry) =>
    Object.hasOwn(entry.scripts, 'check')
  );
  if (collisions.length)
    throw new Error(
      `The check script shadows native bun check; use validate: ${collisions.map((entry) => entry.file).join(', ')}`
    );
}

if (require.main === module) {
  const entries = inventory(path.resolve(__dirname, '../..'));
  assertNoCheckScripts(entries);
  console.log(JSON.stringify(entries, null, 2));
}
module.exports = { inventory, assertNoCheckScripts };

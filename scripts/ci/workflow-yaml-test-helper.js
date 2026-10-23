const { execFileSync } = require('node:child_process');
const path = require('node:path');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');

function readWorkflow(name) {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        path.resolve(workflowsDir, name),
      ],
      { encoding: 'utf8' }
    )
  );
}

// Parses every workflow in one Bun process; keyed by file name.
function readAllWorkflows(dir = workflowsDir) {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        `const dir = process.argv[1];
const out = {};
for (const file of require('node:fs').readdirSync(dir).sort()) {
  if (!/\\.ya?ml$/.test(file)) continue;
  out[file] = Bun.YAML.parse(await Bun.file(dir + '/' + file).text());
}
console.log(JSON.stringify(out));`,
        dir,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  );
}

module.exports = { readAllWorkflows, readWorkflow, workflowsDir };

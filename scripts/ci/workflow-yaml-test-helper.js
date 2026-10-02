const { execFileSync } = require('node:child_process');
const path = require('node:path');

function readWorkflow(name) {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        path.resolve(__dirname, '../../.github/workflows', name),
      ],
      { encoding: 'utf8' }
    )
  );
}

module.exports = { readWorkflow };

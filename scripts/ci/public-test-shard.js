const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { identity, command, save } = require('./public-ci');

function plan(kind, index, root = process.cwd()) {
  if (!Number.isInteger(index) || index < 0 || index > 3)
    throw new Error('Invalid shard');
  if (kind === 'root') {
    const { discoverScriptTests } = require(
      path.join(root, 'scripts/run-script-tests.js')
    );
    const files = discoverScriptTests()
      .sort()
      .filter((_, i) => i % 4 === index);
    if (!files.length) throw new Error('Empty root shard');
    return {
      targets: files,
      commands: [
        {
          argv: [
            process.execPath,
            '--experimental-strip-types',
            '--test',
            '--test-concurrency=2',
            '--test-reporter=tap',
            ...files,
          ],
          tests: true,
        },
      ],
    };
  }
  const { discoverPackages, planShards } = require(
    path.join(root, 'scripts/ci/test-shards.js')
  );
  if (kind === 'unit') {
    const shards = planShards(discoverPackages(root), 4);
    return {
      targets: shards[index].packages,
      commands: [
        {
          argv: [
            process.execPath,
            'scripts/ci/run-test-shard.js',
            String(index),
            '4',
            '--coverage',
          ],
          tests: true,
        },
      ],
    };
  }
  if (kind === 'types') {
    const packages = [];
    for (const parent of ['apps', 'packages'])
      for (const name of fs.readdirSync(path.join(root, parent))) {
        if (name === 'tanstack-web' || name === 'backend') continue;
        const file = path.join(root, parent, name, 'package.json');
        if (!fs.existsSync(file)) continue;
        const pkg = JSON.parse(fs.readFileSync(file));
        if (pkg.scripts?.['type-check'])
          packages.push({ name: pkg.name, weight: 1 });
      }
    const targets = planShards(packages, 4)[index].packages;
    if (
      !targets.length ||
      targets.some((p) => !/^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(p))
    )
      throw new Error('Invalid type-check targets');
    return {
      targets,
      commands: [
        {
          argv: [
            'bun',
            'turbo:local',
            'run',
            'type-check',
            '--concurrency=2',
            ...targets.map((p) => `--filter=${p}`),
          ],
        },
      ],
    };
  }
  if (kind === 'lint' && index === 0)
    return {
      targets: ['repository'],
      commands: [
        { argv: ['bun', 'run', 'lint'] },
        { argv: ['node_modules/.bin/oxfmt', '--check', '.'] },
      ],
    };
  throw new Error('Unknown shard kind');
}
const suppliers = [
  'bun',
  'turbo:local',
  'run',
  'build',
  '--concurrency=2',
  '--filter=@tuturuuu/types',
  '--filter=@tuturuuu/supabase',
  '--filter=@tuturuuu/internal-api',
  '--filter=@tuturuuu/masonry',
  '--filter=tuturuuu',
];
function main() {
  const [kind, rawIndex, output] = process.argv.slice(2);
  const receipt = {
    ...identity(),
    kind,
    shard: Number(rawIndex),
    commands: [],
    status: 'FAIL',
  };
  try {
    const selected = plan(kind, Number(rawIndex));
    receipt.targets = selected.targets;
    receipt.bun = execFileSync('bun', ['--version'], {
      encoding: 'utf8',
    }).trim();
    command(['bun', 'install', '--frozen-lockfile'], receipt);
    if (kind === 'unit' || kind === 'types') command(suppliers, receipt);
    for (const step of selected.commands) command(step.argv, receipt, step);
    receipt.status = 'PASS';
  } finally {
    save(output, receipt);
  }
}
if (require.main === module) main();
module.exports = { plan };

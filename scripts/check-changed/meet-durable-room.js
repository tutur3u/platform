// The workflow contract accepts test paths under apps/meet-realtime only.
// If CI adds a test elsewhere, extend TEST_ARGUMENT in the same change so
// check:changed can accept the new path.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW = '.github/workflows/meet-cloudflare.yaml';
const STEP_NAME = 'Test durable room lifecycle and recovery';
const BUILD_ARGS = [
  'turbo:local',
  'run',
  'build',
  '--filter=@tuturuuu/types',
  '--filter=@tuturuuu/supabase',
  '--concurrency=2',
];
const TEST_ARGUMENT =
  /^"\$GITHUB_WORKSPACE\/(apps\/meet-realtime\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.test\.ts)"$/;

function parseMeetDurableRoomTests(workflow) {
  const steps = workflow?.jobs?.validate?.steps;
  const matches = Array.isArray(steps)
    ? steps.filter((step) => step?.name === STEP_NAME)
    : [];
  const [step] = matches;
  const invalid = () =>
    new Error(
      `${WORKFLOW}: expected "${STEP_NAME}" to cd to RUNNER_TEMP and run an explicit bun test list`
    );
  if (
    matches.length !== 1 ||
    step.shell !== 'bash' ||
    typeof step.run !== 'string'
  )
    throw invalid();

  // Accept the workflow's command and quoted literal paths without running shell code.
  const [cd, command, ...extra] = step.run
    .trimEnd()
    .replace(/\\\r?\n/g, '')
    .split(/\r?\n/);
  const [bun, test, ...args] = command?.trim().split(/[ \t]+/) ?? [];
  if (
    cd !== 'cd "$RUNNER_TEMP"' ||
    extra.length ||
    bun !== 'bun' ||
    test !== 'test' ||
    !args.length
  )
    throw invalid();
  const files = args.map((arg) => {
    const match = TEST_ARGUMENT.exec(arg);
    if (!match) throw invalid();
    return match[1];
  });
  if (new Set(files).size !== files.length) throw invalid();
  return files;
}

function readMeetDurableRoomTests(root) {
  const workflow = JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        path.join(root, WORKFLOW),
      ],
      { cwd: root, encoding: 'utf8' }
    )
  );
  const files = parseMeetDurableRoomTests(workflow);
  for (const file of files) {
    if (
      !fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()
    )
      throw new Error(
        `${WORKFLOW}: durable room test file is missing: ${file}`
      );
  }
  return files;
}

module.exports = {
  WORKFLOW,
  STEP_NAME,
  BUILD_ARGS,
  parseMeetDurableRoomTests,
  readMeetDurableRoomTests,
};

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function exactSha(value) {
  if (
    typeof value !== 'string' ||
    value.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(value)
  )
    throw new Error('Invalid source SHA');
  return value;
}
function appName(value) {
  if (!['web', 'finance', 'meet'].includes(value))
    throw new Error('Invalid app');
  return value;
}
function identity(env = process.env) {
  const sourceSHA = exactSha(env.SOURCE_SHA);
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (actual !== sourceSHA) throw new Error('Checkout identity mismatch');
  const controlSHA = exactSha(env.CONTROL_SHA);
  const controlRoot = path.resolve(__dirname, '../..');
  if (
    execFileSync('git', ['-C', controlRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim() !== controlSHA
  )
    throw new Error('Control checkout identity mismatch');
  return {
    sourceSHA,
    controlSHA,
    admittedMainSHA: exactSha(env.MAIN_SHA),
    node: process.version,
    sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
      encoding: 'utf8',
    }).trim(),
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    runURL: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    lockSHA256: sha256(fs.readFileSync('bun.lock')),
  };
}
function testCounts(text) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
  const tap = [...clean.matchAll(/(?:^|: )# tests (\d+)\s*$/gm)];
  const passed = [...clean.matchAll(/\bTests\s+(\d+)\s+passed/g)];
  const summaries = clean
    .split('\n')
    .filter((line) => /\bTests\s/.test(line))
    .join('\n');
  const skipped = [
    ...clean.matchAll(/(?:^|: )# skipped (\d+)\s*$/gm),
    ...summaries.matchAll(/(\d+) skipped/g),
  ];
  const failed = [
    ...clean.matchAll(/(?:^|: )# fail (\d+)\s*$/gm),
    ...summaries.matchAll(/(\d+) failed/g),
  ];
  const sum = (matches) =>
    matches.reduce((n, m) => n + Number(m[1] || m[2] || 0), 0);
  return {
    tests: sum(tap) + sum(passed),
    skipped: sum(skipped),
    failed: sum(failed),
  };
}
function command(argv, receipt, { tests = false, timeout = 1200000 } = {}) {
  console.log(JSON.stringify({ command: argv }));
  const start = Date.now();
  const result = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout,
    env: {
      ...process.env,
      GITHUB_SHA: receipt.sourceSHA,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      TURBO_FORCE: 'true',
    },
  });
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);
  const counts = tests ? testCounts(output) : null;
  const qualified =
    result.status === 0 &&
    !result.error &&
    (!tests ||
      (counts.tests > 0 && counts.skipped === 0 && counts.failed === 0));
  receipt.commands.push({
    argv,
    exit: result.status,
    signal: result.signal,
    durationMs: Date.now() - start,
    counts,
    qualified,
  });
  if (!qualified)
    throw new Error('Command failed or test execution was empty/skipped');
}
function save(directory, receipt) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n${receipt.kind}: **${receipt.status}** at ${receipt.sourceSHA}. [Run](${receipt.runURL})\n\n\`\`\`json\n${JSON.stringify(receipt.commands, null, 2)}\n\`\`\`\n`
    );
}
module.exports = {
  exactSha,
  appName,
  identity,
  sha256,
  testCounts,
  command,
  save,
};

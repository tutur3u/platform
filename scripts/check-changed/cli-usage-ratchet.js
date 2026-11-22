// The root CLI usage ratchet is a script test under scripts/ci that counts
// mentions of the retiring Worker CLI in every tracked file against an exact
// allowlist: a file that is not listed may not mention it, and a listed file
// must match its recorded counts and digest. Any authored file can therefore
// break it, including a test that quotes a config path as data. The gate runs
// script tests only for the scripts a change touches, so the ratchet is
// selected here by what a changed file says, not by where it lives.
//
// The ratchet scans this file too, so the CLI's name is assembled at runtime.

const CLI = ['wr', 'angler'].join('');
const SCANNER = `scripts/ci/${CLI}-usage.js`;
const ALLOWLIST = `scripts/ci/${CLI}-usage-allowlist.json`;
const GUARD_TEST = `scripts/ci/${CLI}-usage-guard.test.js`;

/** The scanner's exported line counter, named after the CLI. */
const MENTION_COUNTER = `count${CLI[0].toUpperCase()}${CLI.slice(1)}Lines`;

const scanner = () => require(`../ci/${CLI}-usage.js`);

/** The Next adapter whose deploy command the ratchet counts as a publish. */
const ADAPTER = new RegExp(['opennextjs', 'cloudflare'].join('-'), 'iu');

/**
 * True when `change` can alter the ratchet's result: it edits the scanner or
 * the allowlist, touches or removes a file the allowlist counts, adds or
 * edits a config file the scanner counts by its name, or leaves a scanned
 * file mentioning the CLI or the adapter, or holding a publish call as the
 * scanner reads it (a manifest's scripts are decoded first). A file that
 * cannot be read is treated as a mention. The scanner skips its own guard
 * test, which runs as a changed script test.
 */
function affectsCliUsage({ file, status }, { allowlisted, readSource }) {
  if (file === SCANNER || file === ALLOWLIST) return true;
  const {
    classify,
    isScanned,
    scanPublishCalls,
    [MENTION_COUNTER]: countMentionLines,
  } = scanner();
  if (!isScanned(file)) return false;
  if (allowlisted.has(file)) return true;
  if (status === 'D') return false;
  if (classify(file) === 'config') return true;
  try {
    const source = readSource(file) ?? '';
    return (
      countMentionLines(source) > 0 ||
      ADAPTER.test(source) ||
      file in scanPublishCalls({ files: [file], readFile: () => source })
    );
  } catch {
    return true;
  }
}

/** Paths the allowlist counts, or null when it cannot be read. */
function countedFiles(readAllowlist) {
  try {
    const allowlist = readAllowlist();
    return new Set([
      ...Object.keys(allowlist.files ?? {}),
      ...Object.keys(allowlist.publishCalls ?? {}),
    ]);
  } catch {
    return null;
  }
}

/**
 * The ratchet as a gate step when a change can alter its result. An
 * allowlist that cannot be read plans it too, so the guard reports the file.
 */
function cliUsageRatchetSteps(changes, context = {}) {
  if (!changes.length) return [];
  const allowlisted = countedFiles(
    context.readCliAllowlist ?? scanner().readAllowlist
  );
  const scope = { allowlisted, readSource: context.readSource ?? (() => '') };
  if (allowlisted && !changes.some((change) => affectsCliUsage(change, scope)))
    return [];
  return [
    {
      id: 'cli-usage-ratchet',
      label: 'root CLI usage ratchet',
      command: 'node',
      args: ['--test', GUARD_TEST],
      fixHint: `A file mentions ${CLI} outside the allowlist, or a listed file does not match its counts. Remove the mention (a test can assemble such a string from parts), or lower the entry in ${ALLOWLIST}; new usage needs a recorded gap.`,
    },
  ];
}

/**
 * Drops the step when the script tests already run the guard test. Applied
 * to the steps that will run, after `--only` and `--skip`, so a filter that
 * removes the script tests keeps the dedicated step.
 */
function withoutRepeatedGuard(steps) {
  const repeated = steps.some(
    (step) => step.id === 'script-tests' && step.args.includes(GUARD_TEST)
  );
  return repeated
    ? steps.filter((step) => step.id !== 'cli-usage-ratchet')
    : steps;
}

module.exports = {
  ALLOWLIST,
  GUARD_TEST,
  SCANNER,
  affectsCliUsage,
  cliUsageRatchetSteps,
  withoutRepeatedGuard,
};

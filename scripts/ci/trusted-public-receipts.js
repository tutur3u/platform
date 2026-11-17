const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const MAX_RECEIPT_BYTES = 512 * 1024;
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const SHARDS = ['unit', 'root', 'types']
  .flatMap((kind) => [0, 1, 2, 3].map((shard) => `${kind}-${shard}`))
  .concat('lint-0');

class PublicReceiptError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.phase = 'artifact-consumption';
  }
}

function requireEvidence(condition, code) {
  if (!condition) throw new PublicReceiptError(code);
}

function expectedIdentity(env) {
  const identity = {
    sourceSHA: env.SOURCE_SHA,
    controlSHA: env.CONTROL_SHA,
    admittedMainSHA: env.MAIN_SHA,
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
  };
  requireEvidence(
    [identity.sourceSHA, identity.controlSHA, identity.admittedMainSHA].every(
      (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
    ) &&
      [identity.run, identity.attempt].every(
        (value) =>
          typeof value === 'string' &&
          /^[1-9]\d*$/.test(value) &&
          Number.isSafeInteger(Number(value))
      ),
    'PUBLIC_RECEIPT_EXPECTED_IDENTITY'
  );
  return identity;
}

function directory(root) {
  const stat = fs.lstatSync(root);
  requireEvidence(
    stat.isDirectory() && !stat.isSymbolicLink(),
    'PUBLIC_RECEIPT_DIRECTORY'
  );
}

function readReceipt(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const stat = fs.fstatSync(descriptor);
    requireEvidence(
      stat.isFile() && stat.size > 0 && stat.size <= MAX_RECEIPT_BYTES,
      'PUBLIC_RECEIPT_FILE'
    );
    const bytes = Buffer.alloc(MAX_RECEIPT_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = fs.readSync(
        descriptor,
        bytes,
        size,
        bytes.length - size,
        null
      );
      if (!count) break;
      size += count;
    }
    requireEvidence(size <= MAX_RECEIPT_BYTES, 'PUBLIC_RECEIPT_SIZE');
    try {
      return JSON.parse(bytes.subarray(0, size).toString('utf8'));
    } catch {
      throw new PublicReceiptError('PUBLIC_RECEIPT_JSON');
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function checkIdentity(receipt, expected) {
  requireEvidence(
    receipt &&
      typeof receipt === 'object' &&
      !Array.isArray(receipt) &&
      Object.entries(expected).every(([key, value]) => receipt[key] === value),
    'PUBLIC_RECEIPT_IDENTITY'
  );
  requireEvidence(receipt.status === 'PASS', 'PUBLIC_RECEIPT_STATUS');
}

function checkCommands(receipt) {
  requireEvidence(
    Array.isArray(receipt.commands) &&
      receipt.commands.length > 0 &&
      receipt.commands.length <= 256,
    'PUBLIC_RECEIPT_COMMANDS'
  );
  let tests = 0;
  for (const command of receipt.commands) {
    requireEvidence(
      command &&
        command.qualified === true &&
        command.exit === 0 &&
        command.signal === null &&
        Array.isArray(command.argv) &&
        command.argv.length > 0 &&
        command.argv.length <= 512 &&
        command.argv.every(
          (arg) => typeof arg === 'string' && arg.length <= 4096
        ),
      'PUBLIC_RECEIPT_COMMAND'
    );
    if (command.counts !== null) {
      const counts = command.counts;
      requireEvidence(
        counts &&
          Number.isSafeInteger(counts.tests) &&
          counts.tests > 0 &&
          counts.failed === 0 &&
          counts.skipped === 0,
        'PUBLIC_RECEIPT_COUNTS'
      );
      tests += counts.tests;
    }
  }
  requireEvidence(Number.isSafeInteger(tests), 'PUBLIC_RECEIPT_COUNTS');
  return tests;
}

function archiveDigest(file, expectedBytes) {
  requireEvidence(
    Number.isSafeInteger(expectedBytes) &&
      expectedBytes > 0 &&
      expectedBytes <= MAX_ARCHIVE_BYTES,
    'PUBLIC_ARCHIVE_SIZE'
  );
  let descriptor;
  try {
    descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const stat = fs.fstatSync(descriptor);
    requireEvidence(
      stat.isFile() && stat.size === expectedBytes,
      'PUBLIC_ARCHIVE_FILE'
    );
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let size = 0;
    while (size <= expectedBytes) {
      const count = fs.readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.length, expectedBytes - size + 1),
        null
      );
      if (!count) break;
      size += count;
      requireEvidence(size <= expectedBytes, 'PUBLIC_ARCHIVE_SIZE');
      hash.update(buffer.subarray(0, count));
    }
    requireEvidence(size === expectedBytes, 'PUBLIC_ARCHIVE_SIZE');
    return hash.digest('hex');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function verifyBuild(root, expected, app) {
  directory(root);
  requireEvidence(['finance', 'web', 'meet'].includes(app), 'PUBLIC_BUILD_APP');
  const receipt = readReceipt(path.join(root, 'receipt.json'));
  checkIdentity(receipt, expected);
  requireEvidence(
    receipt.kind === 'public-build' && receipt.app === app,
    'PUBLIC_BUILD_IDENTITY'
  );
  checkCommands(receipt);
  requireEvidence(
    typeof receipt.archiveSHA256 === 'string' &&
      /^[a-f0-9]{64}$/.test(receipt.archiveSHA256),
    'PUBLIC_ARCHIVE_HASH'
  );
  requireEvidence(
    archiveDigest(
      path.join(root, 'public-compiler.tar.gz'),
      receipt.archiveBytes
    ) === receipt.archiveSHA256,
    'PUBLIC_ARCHIVE_HASH'
  );
  return {
    qualified: true,
    kind: 'public-build',
    app,
    archiveSHA256: receipt.archiveSHA256,
  };
}

function verifyTests(root, expected) {
  directory(root);
  const names = fs.readdirSync(root);
  requireEvidence(names.length === SHARDS.length, 'PUBLIC_RECEIPT_INVENTORY');
  const seen = new Set();
  let tests = 0;
  for (const name of names) {
    const child = path.join(root, name);
    directory(child);
    const receipt = readReceipt(path.join(child, 'receipt.json'));
    checkIdentity(receipt, expected);
    const key = `${receipt.kind}-${receipt.shard}`;
    requireEvidence(
      SHARDS.includes(key) &&
        !seen.has(key) &&
        name ===
          `public-tests-${expected.sourceSHA}-${key}-${expected.attempt}`,
      'PUBLIC_RECEIPT_SHARD'
    );
    seen.add(key);
    const count = checkCommands(receipt);
    requireEvidence(
      !['unit', 'root'].includes(receipt.kind) || count > 0,
      'PUBLIC_RECEIPT_EMPTY_TESTS'
    );
    tests += count;
  }
  requireEvidence(
    Number.isSafeInteger(tests) && tests > 0,
    'PUBLIC_RECEIPT_EMPTY_TESTS'
  );
  return { qualified: true, kind: 'public-tests', receipts: seen.size, tests };
}

function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const [kind, root] = argv;
    requireEvidence(
      typeof root === 'string' && root.length > 0,
      'PUBLIC_RECEIPT_ROOT'
    );
    const expected = expectedIdentity(env);
    requireEvidence(['build', 'tests'].includes(kind), 'PUBLIC_RECEIPT_KIND');
    const result =
      kind === 'build'
        ? verifyBuild(root, expected, env.APP)
        : verifyTests(root, expected);
    const output = JSON.stringify(result);
    console.log(output);
    if (env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `\n${output}\n`);
    return 0;
  } catch (error) {
    const code =
      error instanceof PublicReceiptError ? error.code : 'PUBLIC_RECEIPT_IO';
    console.error(
      JSON.stringify({ qualified: false, phase: 'artifact-consumption', code })
    );
    return 1;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = {
  expectedIdentity,
  verifyBuild,
  verifyTests,
  PublicReceiptError,
  main,
};

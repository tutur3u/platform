const {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
} = require('node:fs');
const { join } = require('node:path');

// Emit fixed classifications only, never raw host panic text or stack contents.
function classifyPanic(text) {
  const signatures = [];
  if (
    /failed to create new OS thread|newosproc|pthread_create.*failed/i.test(
      text
    )
  )
    signatures.push('host-thread-allocation-failure');
  if (/cannot allocate memory|out of memory|outofmemory/i.test(text))
    signatures.push('host-memory-allocation-failure');
  if (/SIGSYS/.test(text)) signatures.push('runtime-syscall-signal');
  if (/panic:/.test(text)) signatures.push('runtime-panic');
  if (/fatal error:/.test(text)) signatures.push('runtime-fatal');
  return signatures;
}

function summarizePanics(root, pool) {
  if (!root || !/^ci-[0-9]+-[0-9]+$/.test(pool))
    throw new Error('Synthetic panic diagnostics require a CI pool');
  const directory = join(root, `ttr-runsc-panic-${pool}`);
  if (
    !lstatSync(directory).isDirectory() ||
    lstatSync(directory).isSymbolicLink()
  )
    throw new Error('Invalid owned panic directory');
  const signatures = new Set();
  let inspected = 0;
  for (const name of readdirSync(directory).sort().slice(0, 16)) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const openedStat = fstatSync(fd);
      if (!openedStat.isFile()) continue;
      // Fatal headers and trailing summaries suffice; do not read unbounded stacks.
      const first = Buffer.alloc(16 * 1024);
      const last = Buffer.alloc(16 * 1024);
      const headBytes = readSync(fd, first, 0, first.length, 0);
      const tailBytes = readSync(
        fd,
        last,
        0,
        last.length,
        Math.max(0, openedStat.size - last.length)
      );
      for (const signature of classifyPanic(
        first.subarray(0, headBytes).toString() +
          last.subarray(0, tailBytes).toString()
      ))
        signatures.add(signature);
      inspected++;
    } finally {
      closeSync(fd);
    }
  }
  return {
    inspected,
    signatures: [...signatures].sort(),
    maxFiles: 16,
    maxReadBytesPerFile: 32768,
  };
}

if (require.main === module) {
  try {
    console.log(
      JSON.stringify(summarizePanics(process.argv[2], process.argv[3] ?? ''))
    );
  } catch {
    console.log(JSON.stringify({ diagnosticsUnavailable: true }));
  }
}
module.exports = { classifyPanic, summarizePanics };

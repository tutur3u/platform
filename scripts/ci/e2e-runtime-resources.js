const { open } = require('node:fs/promises');

const MAX_PROC_BYTES = 32_768;

async function readBoundedProc(path, { signal } = {}) {
  signal?.throwIfAborted();
  const file = await open(path, 'r');
  try {
    signal?.throwIfAborted();
    const buffer = Buffer.alloc(MAX_PROC_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    signal?.throwIfAborted();
    if (bytesRead > MAX_PROC_BYTES) {
      throw new Error('Unavailable resource field');
    }
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    await file.close();
  }
}

const RESOURCE_FILES = Object.freeze([
  '/proc/meminfo',
  '/proc/vmstat',
  '/proc/pressure/cpu',
  '/proc/pressure/memory',
  '/proc/pressure/io',
]);

function numericField(text, expression) {
  const match = text.match(expression);
  if (!match) throw new Error('Unavailable resource field');
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Unavailable resource field');
  }
  return value;
}

function parseResourceSnapshot(texts, rssBytes) {
  if (texts.some((text) => text.length > MAX_PROC_BYTES)) {
    throw new Error('Unavailable resource field');
  }
  const [memory, vmstat, cpu, memoryPressure, io] = texts;
  const pressure = (text, kind) =>
    numericField(text, new RegExp(`^${kind} .*total=(\\d+)(?:\\s|$)`, 'm'));
  return {
    memAvailableKiB: numericField(memory, /^MemAvailable:\s+(\d+)\s+kB$/m),
    swapFreeKiB: numericField(memory, /^SwapFree:\s+(\d+)\s+kB$/m),
    majorFaults: numericField(vmstat, /^pgmajfault\s+(\d+)$/m),
    swapPagesIn: numericField(vmstat, /^pswpin\s+(\d+)$/m),
    swapPagesOut: numericField(vmstat, /^pswpout\s+(\d+)$/m),
    cpuPressureSomeUs: pressure(cpu, 'some'),
    memoryPressureSomeUs: pressure(memoryPressure, 'some'),
    memoryPressureFullUs: pressure(memoryPressure, 'full'),
    ioPressureSomeUs: pressure(io, 'some'),
    ioPressureFullUs: pressure(io, 'full'),
    rssBytes: numericField(String(rssBytes), /^(\d+)$/),
  };
}

// Fixed Linux proc files only; never read process arguments, identities or env.
function createResourceSampler({
  read = readBoundedProc,
  rss = () => process.memoryUsage.rss(),
  publish = (snapshot) => console.info('[e2e-resources] runner', snapshot),
} = {}) {
  let active = true;
  let pending = false;
  return {
    async sample() {
      if (!active || pending) return;
      pending = true;
      try {
        const signal = AbortSignal.timeout(1000);
        const reads = await Promise.allSettled(
          RESOURCE_FILES.map((file) => read(file, { encoding: 'utf8', signal }))
        );
        if (reads.some((result) => result.status === 'rejected')) {
          throw new Error('Unavailable resource field');
        }
        const texts = reads.map((result) => result.value);
        const snapshot = parseResourceSnapshot(texts, rss());
        if (active) publish(snapshot);
      } catch {
        if (active) publish({ unavailable: 1 });
      } finally {
        pending = false;
      }
    },
    stop() {
      active = false;
    },
  };
}

module.exports = {
  MAX_PROC_BYTES,
  readBoundedProc,
  RESOURCE_FILES,
  parseResourceSnapshot,
  createResourceSampler,
};

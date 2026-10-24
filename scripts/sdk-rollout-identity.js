const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { atomicJson, readJson } = require('./sdk-rollout-artifact');

// Identity-aware suppliers refuse unversioned owners for nesting, so a rollout
// held under one must record the kernel start identity of its own process and
// of every child it launches. Older suppliers keep the record they understand.
const backends = { linux: 'linux-proc-v1', darwin: 'darwin-libproc-v1' };
const fields = ['backend', 'host', 'boot', 'namespace', 'birth'];
const timeoutMs = 15_000;
const identityArgs = (pid) => [
  'resources',
  'identity',
  '--pid',
  String(pid),
  '--json',
];
const exactKeys = (value, keys) =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort());

function identityCapable(root) {
  return fs.existsSync(
    path.join(root, 'dist/cli/resources-process-identity.js')
  );
}
function parseIdentity(output, pid) {
  let value;
  try {
    value = JSON.parse(String(output));
  } catch {
    throw new Error('Process identity output is not JSON; ownership not bound');
  }
  const start = value?.pidStart;
  if (
    !Number.isInteger(pid) ||
    pid < 1 ||
    !exactKeys(value, ['pid', 'ownershipVersion', 'pidStart']) ||
    value.pid !== pid ||
    value.ownershipVersion !== 1 ||
    !exactKeys(start, fields) ||
    start.backend !== backends[process.platform] ||
    !fields.every(
      (key) =>
        typeof start[key] === 'string' &&
        start[key].length >= 1 &&
        start[key].length <= 256
    )
  )
    throw new Error('Invalid process identity receipt; ownership not bound');
  return {
    pid,
    ownershipVersion: 1,
    pidStart: Object.fromEntries(fields.map((key) => [key, start[key]])),
  };
}
const sameStart = (left, right) =>
  Boolean(left && right) && fields.every((key) => left[key] === right[key]);
const ownerFields = (receipt) =>
  receipt ? { ownershipVersion: 1, pidStart: receipt.pidStart } : {};

// Asks the verified supplier about this still-running worker. Saved PIDs are
// never adopted: the caller passes its own live process.
async function captureSelf(invoke, cli, settings) {
  return parseIdentity(
    await invoke(cli, identityArgs(process.pid), { ...settings, timeoutMs }),
    process.pid
  );
}
// The launch gate holds the spawned launcher before its workload starts, and
// its receipt must be durable before launch, so this inspection is synchronous.
function inspectSync(command, args, settings) {
  return cp.execFileSync(command, args, {
    env: settings.env,
    cwd: settings.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024,
  });
}
function captureChild(inspect, cli, pid, settings) {
  let output;
  try {
    output = inspect(cli, identityArgs(pid), settings);
  } catch {
    throw new Error('Child process identity inspection failed; not launched');
  }
  return parseIdentity(output, pid).pidStart;
}
// Version 1 owners record the child's start identity atomically with its PID,
// before the launch gate opens. Legacy owners keep the PID-only record.
function withChild(owner, pid, inspect, cli, settings) {
  return owner.ownershipVersion === 1
    ? {
        ...owner,
        childPid: pid,
        childStart: captureChild(inspect, cli, pid, settings),
      }
    : { ...owner, childPid: pid };
}
// An identity-capable supplier binds the lease from creation; a failed capture
// never falls back to an unversioned owner.
async function leaseReceipt(root, invoke, cli, settings) {
  return identityCapable(root) ? captureSelf(invoke, cli, settings) : null;
}
// Enriches the held maintenance owner in place, preserving its token and
// metadata. An owner with a recorded child is unsettled and never rebound.
function bindOwner(file, token, receipt) {
  const owner = readJson(file);
  if (
    owner.token !== token ||
    owner.pid !== receipt.pid ||
    owner.childPid !== undefined ||
    owner.childStart !== undefined
  )
    throw new Error('Maintenance owner changed or unsettled; not bound');
  if (owner.ownershipVersion === undefined && owner.pidStart === undefined)
    atomicJson(file, { ...owner, ...ownerFields(receipt) });
  else if (
    owner.ownershipVersion !== 1 ||
    !sameStart(owner.pidStart, receipt.pidStart)
  )
    throw new Error('Maintenance owner identity differs from this worker');
}
// After installation, a capable supplier binds the held lease before setup. A
// lease already bound under the previous supplier must not lose its identity.
async function bindInstalled({ root, lock, file, invoke, cli, settings }) {
  if (!identityCapable(root)) {
    if (lock.receipt)
      throw new Error(
        'Installed supplier cannot verify identity-bound maintenance ownership'
      );
    return null;
  }
  const receipt = await captureSelf(invoke, cli, settings);
  if (lock.receipt && !sameStart(lock.receipt.pidStart, receipt.pidStart))
    throw new Error('Worker process identity changed during rollout');
  bindOwner(file, lock.token, receipt);
  return receipt;
}

module.exports = {
  identityCapable,
  parseIdentity,
  sameStart,
  ownerFields,
  captureSelf,
  inspectSync,
  captureChild,
  withChild,
  leaseReceipt,
  bindOwner,
  bindInstalled,
};

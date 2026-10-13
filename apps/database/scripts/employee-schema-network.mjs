import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  readEmployeeCleanupReceipt,
  validateEmployeeNetwork,
  writeEmployeeCleanupQualification,
  writeEmployeeNetworkCleanupReceipt,
} from './employee-schema-cleanup-receipt.mjs';

export { validateEmployeeNetwork } from './employee-schema-cleanup-receipt.mjs';

import { deriveIsolatedIdentity } from './run-supabase-isolated.js';

const failure = () => new Error('Bounded employee type generation failed');
/** Capture bounded output; drain diagnostics and the owned process group before resolving. */
export function runTypegenCommand(
  command,
  args,
  cwd,
  { timeoutMs = 300000, maxBytes = 32 * 1024 * 1024, killGraceMs = 1000 } = {}
) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(failure());
      return;
    }
    const chunks = [];
    let bytes = 0;
    let denied = false;
    let forceTimer;
    const signalGroup = (signal) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') denied = true;
      }
    };
    const terminate = () => {
      denied = true;
      signalGroup('SIGTERM');
      forceTimer ??= setTimeout(() => signalGroup('SIGKILL'), killGraceMs);
    };
    const deadline = setTimeout(terminate, timeoutMs);
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) terminate();
      else if (!denied) chunks.push(chunk);
    });
    child.stderr.resume();
    child.on('error', () => {
      denied = true;
    });
    child.on('close', async (code, signal) => {
      clearTimeout(deadline);
      clearTimeout(forceTimer);
      // A direct child exit is not evidence that its subprocesses have drained.
      const groupExists = () => {
        try {
          if (child.pid) process.kill(-child.pid, 0);
          return Boolean(child.pid);
        } catch (error) {
          return error.code !== 'ESRCH';
        }
      };
      if (groupExists()) {
        denied = true;
        signalGroup('SIGKILL');
        const drainDeadline = Date.now() + 5000;
        while (groupExists() && Date.now() < drainDeadline) {
          await new Promise((drain) => setTimeout(drain, 25));
        }
      }
      if (denied || signal || code !== 0) reject(failure());
      else resolve(Buffer.concat(chunks));
    });
  });
}

const labelPrefix = 'ttr.employee.';
const networkFields = [
  'source',
  'control',
  'run',
  'attempt',
  'nonce',
  'project',
];
const networkFailure = () =>
  new Error('Employee internal network admission failed');
export async function verifyEmployeeNetwork(
  expected,
  runner = runTypegenCommand
) {
  if (!expected?.id || !/^[a-f0-9]{64}$/.test(expected.id))
    throw networkFailure();
  try {
    const bytes = await runner(
      'docker',
      ['network', 'inspect', expected.id],
      process.cwd(),
      { timeoutMs: 10000, maxBytes: 65536 }
    );
    const rows = JSON.parse(bytes.toString());
    if (!Array.isArray(rows) || rows.length !== 1) throw networkFailure();
    return validateEmployeeNetwork(rows[0], expected);
  } catch {
    throw networkFailure();
  }
}
function networkContext(sourceRoot) {
  const source = process.env.EMPLOYEE_SCHEMA_SOURCE_SHA,
    control = process.env.EMPLOYEE_SCHEMA_CONTROL_SHA;
  const run = process.env.GITHUB_RUN_ID,
    attempt = process.env.GITHUB_RUN_ATTEMPT;
  if (
    process.platform !== 'linux' ||
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    !/^[a-f0-9]{40}$/.test(source ?? '') ||
    !/^[a-f0-9]{40}$/.test(control ?? '') ||
    !/^[1-9][0-9]*$/.test(run ?? '') ||
    !/^[1-9][0-9]*$/.test(attempt ?? '') ||
    !path.isAbsolute(process.env.RUNNER_TEMP ?? '')
  )
    throw networkFailure();
  return {
    source,
    control,
    run,
    attempt,
    project: deriveIsolatedIdentity({
      headSha: source,
      repositoryPath: sourceRoot,
    }).projectId,
    name: `tt-employee-net-${run}-${attempt}`,
    marker: path.join(process.env.RUNNER_TEMP, 'employee-network-owned.json'),
    receiptDirectory: path.join(
      process.env.RUNNER_TEMP,
      'employee-schema-receipts'
    ),
  };
}
export async function readEmployeeNetwork(
  sourceRoot,
  runner = runTypegenCommand,
  context = networkContext(sourceRoot)
) {
  const stat = lstatSync(context.marker);
  if (!stat.isFile() || stat.isSymbolicLink()) throw networkFailure();
  const expected = JSON.parse(readFileSync(context.marker, 'utf8'));
  if (
    expected.name !== context.name ||
    !/^[a-f0-9-]{36}$/.test(expected.labels?.[`${labelPrefix}nonce`] ?? '') ||
    !['source', 'control', 'run', 'attempt', 'project'].every(
      (key) => expected.labels?.[labelPrefix + key] === context[key]
    )
  )
    throw networkFailure();
  return verifyEmployeeNetwork(expected, runner);
}
export async function createEmployeeNetwork(
  sourceRoot,
  { runner = runTypegenCommand, context = networkContext(sourceRoot) } = {}
) {
  try {
    lstatSync(context.marker);
    throw networkFailure();
  } catch (error) {
    if (error.code !== 'ENOENT') throw networkFailure();
  }
  const existing = await runner(
    'docker',
    [
      'network',
      'ls',
      '--filter',
      `name=^${context.name}$`,
      '--format',
      '{{.ID}}',
    ],
    process.cwd(),
    { timeoutMs: 10000, maxBytes: 1024 }
  );
  if (existing.toString().trim()) throw networkFailure();
  const labels = Object.fromEntries(
    networkFields.map((key) => [
      labelPrefix + key,
      key === 'nonce' ? randomUUID() : context[key],
    ])
  );
  const id = (
    await runner(
      'docker',
      [
        'network',
        'create',
        '--internal',
        '--driver',
        'bridge',
        ...Object.entries(labels).flatMap(([key, value]) => [
          '--label',
          `${key}=${value}`,
        ]),
        context.name,
      ],
      process.cwd(),
      { timeoutMs: 10000, maxBytes: 1024 }
    )
  )
    .toString()
    .trim();
  const expected = { id, name: context.name, labels };
  await verifyEmployeeNetwork(expected, runner);
  writeFileSync(context.marker, JSON.stringify(expected), {
    flag: 'wx',
    mode: 0o600,
  });
}
export async function removeEmployeeNetwork(
  sourceRoot,
  { runner = runTypegenCommand, context = networkContext(sourceRoot) } = {}
) {
  const expected = await readEmployeeNetwork(sourceRoot, runner, context);
  const receipt = readEmployeeCleanupReceipt(context, expected);
  const remaining = await runner(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      `label=com.supabase.cli.project=${context.project}`,
      '--format',
      '{{.ID}}',
    ],
    process.cwd(),
    { timeoutMs: 10000, maxBytes: 65536 }
  );
  const networkBytes = await runner(
    'docker',
    ['network', 'inspect', expected.id],
    process.cwd(),
    { timeoutMs: 10000, maxBytes: 65536 }
  );
  if (
    remaining.toString().trim() ||
    Object.keys(JSON.parse(networkBytes.toString())[0].Containers ?? {}).length
  )
    throw networkFailure();
  readEmployeeCleanupReceipt(context, expected);
  await runner('docker', ['network', 'rm', expected.id], process.cwd(), {
    timeoutMs: 10000,
    maxBytes: 1024,
  });
  const ids = await runner(
    'docker',
    [
      'network',
      'ls',
      '--no-trunc',
      '--filter',
      `name=^${expected.name}$`,
      '--format',
      '{{.ID}}',
    ],
    process.cwd(),
    { timeoutMs: 10000, maxBytes: 1024 }
  );
  if (ids.toString().trim()) throw networkFailure();
  const directory = context.receiptDirectory;
  writeEmployeeNetworkCleanupReceipt(directory, context, expected);
  receipt.networkCleanupSucceeded = true;
  receipt.combinedQualified =
    receipt.schemaQualified === true &&
    receipt.typesQualified === true &&
    receipt.networkQualified === true &&
    receipt.controllerQualified === true &&
    receipt.startupEvidenceDrained === true;
  writeEmployeeCleanupQualification(directory, receipt);
  return {
    networkCleanupSucceeded: true,
    combinedQualified: receipt.combinedQualified,
  };
}

/** Process only fixed event fields; do not retain Docker labels or private diagnostics. */
export function createNetworkEventProof(projectId, networkId) {
  const containers = new Map();
  const connections = new Map();
  let failed = false,
    events = 0,
    bytes = 0;
  return {
    accept(line) {
      bytes += Buffer.byteLength(line);
      events++;
      if (bytes > 16 * 1024 * 1024 || events > 10000) {
        failed = true;
        return;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        failed = true;
        return;
      }
      const id = event.Actor?.ID,
        attrs = event.Actor?.Attributes;
      if (
        event.Type === 'network' &&
        ['connect', 'disconnect'].includes(event.Action) &&
        /^[a-f0-9]{64}$/.test(attrs?.container ?? '')
      ) {
        const set = connections.get(attrs.container) ?? new Set();
        if (event.Action === 'connect') set.add(id);
        else set.delete(id);
        connections.set(attrs.container, set);
        if (containers.has(attrs.container) && id !== networkId) failed = true;
      }
      if (
        event.Type !== 'container' ||
        attrs?.['com.supabase.cli.project'] !== projectId
      )
        return;
      if (!/^[a-f0-9]{64}$/.test(id ?? '')) {
        failed = true;
        return;
      }
      if (event.Action === 'create') {
        if (containers.has(id)) {
          failed = true;
          return;
        }
        if (
          !/^ghcr\.io\/supabase\/[a-z0-9_-]+(?::[A-Za-z0-9._-]+|@sha256:[a-f0-9]{64})$/.test(
            attrs.image ?? ''
          )
        )
          failed = true;
        containers.set(id, { id, image: attrs.image, started: false });
      } else if (event.Action === 'start') {
        const container = containers.get(id),
          set = connections.get(id);
        if (!container || !set || set.size !== 1 || !set.has(networkId))
          failed = true;
        else container.started = true;
      } else if (event.Action === 'destroy' && !containers.has(id))
        failed = true;
    },
    result() {
      return {
        qualified:
          !failed &&
          containers.size > 0 &&
          [...containers.values()].every((item) => item.started) &&
          [...containers.values()].some((item) =>
            /^ghcr\.io\/supabase\/postgres-meta[:@]/.test(item.image ?? '')
          ),
        networkId,
        containerIds: [...containers.keys()].sort(),
        images: [
          ...new Set([...containers.values()].map((item) => item.image)),
        ].sort(),
      };
    },
    healthy() {
      return !failed;
    },
  };
}
/** Compare a complete authoritative history window to the live subscription. */
export function networkCoverageProof(
  live,
  history,
  ready,
  end,
  projectId,
  networkId
) {
  const window = (events) => {
    const anchor = (marker) =>
      events.findIndex(
        (event) =>
          event.Type === 'network' &&
          event.Action === 'create' &&
          event.Actor?.ID === marker.id &&
          event.Actor?.Attributes?.name === marker.name
      );
    const first = anchor(ready),
      last = anchor(end);
    if (first < 0 || last <= first) return null;
    const rows = events.slice(first + 1, last);
    const ids = new Set(
      rows
        .filter(
          (event) =>
            event.Type === 'container' &&
            event.Actor?.Attributes?.['com.supabase.cli.project'] === projectId
        )
        .map((event) => event.Actor.ID)
    );
    return rows.filter((event) =>
      event.Type === 'container'
        ? ids.has(event.Actor?.ID) &&
          ['create', 'start', 'destroy'].includes(event.Action)
        : event.Type === 'network' &&
          ids.has(event.Actor?.Attributes?.container) &&
          ['connect', 'disconnect'].includes(event.Action)
    );
  };
  const a = window(live),
    b = window(history);
  if (!a || !b || JSON.stringify(a) !== JSON.stringify(b))
    return { qualified: false };
  const proof = createNetworkEventProof(projectId, networkId);
  for (const event of b) proof.accept(JSON.stringify(event));
  const result = proof.result();
  const destroyed = new Set(
    b
      .filter(
        (event) => event.Type === 'container' && event.Action === 'destroy'
      )
      .map((event) => event.Actor.ID)
  );
  return {
    ...result,
    qualified:
      result.qualified && result.containerIds.every((id) => destroyed.has(id)),
    readyMarkerId: ready.id,
    endMarkerId: end.id,
    completeHistoryWindow: true,
  };
}
function safeEvent(line) {
  const e = JSON.parse(line),
    a = e.Actor?.Attributes;
  return {
    Type: e.Type,
    Action: e.Action,
    Actor: {
      ID: e.Actor?.ID,
      Attributes: {
        container: a?.container,
        name: a?.name,
        image: a?.image,
        'com.supabase.cli.project': a?.['com.supabase.cli.project'],
      },
    },
  };
}
async function retireMarker(expected, runner) {
  await verifyEmployeeNetwork(expected, runner);
  const rows = JSON.parse(
    (
      await runner(
        'docker',
        ['network', 'inspect', expected.id],
        process.cwd(),
        { timeoutMs: 10000, maxBytes: 65536 }
      )
    ).toString()
  );
  if (Object.keys(rows[0].Containers ?? {}).length) throw networkFailure();
  await runner('docker', ['network', 'rm', expected.id], process.cwd(), {
    timeoutMs: 10000,
    maxBytes: 1024,
  });
  const remaining = await runner(
    'docker',
    [
      'network',
      'ls',
      '--filter',
      `name=^${expected.name}$`,
      '--format',
      '{{.ID}}',
    ],
    process.cwd(),
    { timeoutMs: 10000, maxBytes: 1024 }
  );
  if (remaining.toString().trim()) throw networkFailure();
}
async function drainObserverGroup(child, closed) {
  let didClose = false;
  void closed.then(() => {
    didClose = true;
  });
  if (!Number.isInteger(child.pid) || child.pid <= 0) return false;
  const exists = () => {
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      return error.code !== 'ESRCH';
    }
  };
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Only subsequent group absence and actual close can acknowledge drain.
  }
  const until = Date.now() + 5000;
  while ((!didClose || exists()) && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, 25));
  return didClose && !exists();
}
export function startEmployeeNetworkObserver(
  projectId,
  networkId,
  {
    spawnEvents = spawn,
    timeoutMs = 25 * 60 * 1000,
    runner = runTypegenCommand,
    context,
  } = {}
) {
  const journal = [],
    waiters = new Set();
  let pending = '',
    failed = false,
    retiring = false,
    ready,
    end,
    bytes = 0;
  const child = spawnEvents(
    'docker',
    ['events', '--since', '0', '--format', '{{json .}}'],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stderr.resume();
  child.on('error', () => {
    failed = true;
  });
  child.on('close', () => {
    if (!retiring) failed = true;
    for (const wake of waiters) wake();
  });
  child.stdout.on('data', (chunk) => {
    if (failed) return;
    bytes += chunk.length;
    pending += chunk.toString();
    if (bytes > 16 * 1024 * 1024 || pending.length > 262144) {
      failed = true;
      child.kill('SIGTERM');
      return;
    }
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      try {
        journal.push(safeEvent(pending.slice(0, newline)));
      } catch {
        failed = true;
      }
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
    if (journal.length > 10000) failed = true;
    for (const wake of waiters) wake();
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  const deadline = setTimeout(() => {
    failed = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  const waitFor = (marker) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(networkFailure());
      }, 5000);
      const cleanup = () => {
        clearTimeout(timer);
        waiters.delete(wake);
      };
      const wake = () => {
        if (failed || child.exitCode !== null || child.signalCode !== null) {
          cleanup();
          reject(networkFailure());
        } else if (
          journal.some(
            (e) =>
              e.Type === 'network' &&
              e.Action === 'create' &&
              e.Actor?.ID === marker.id &&
              e.Actor?.Attributes?.name === marker.name
          )
        ) {
          cleanup();
          resolve();
        }
      };
      waiters.add(wake);
      wake();
    });
  const barrier = async (kind) => {
    const base = context ?? networkContext(process.cwd());
    if (base.project !== projectId) throw networkFailure();
    const name = `${base.name}-${kind}-${randomUUID().slice(0, 8)}`;
    const markerContext = {
      ...base,
      name,
      marker: path.join(path.dirname(base.marker), `${name}.json`),
    };
    await createEmployeeNetwork(process.cwd(), {
      runner,
      context: markerContext,
    });
    const marker = await readEmployeeNetwork(
      process.cwd(),
      runner,
      markerContext
    );
    try {
      await waitFor(marker);
    } finally {
      await retireMarker(marker, runner);
    }
    return marker;
  };
  return {
    async ready() {
      ready = await barrier('ready');
      return ready;
    },
    async assertHealthy() {
      await new Promise((resolve) => setImmediate(resolve));
      if (
        !ready ||
        failed ||
        child.exitCode !== null ||
        child.signalCode !== null
      )
        throw networkFailure();
    },
    async finish() {
      let result = { qualified: false },
        observerDrained = false;
      try {
        if (!ready) throw networkFailure();
        end = await barrier('end');
        const snapshot = await runner(
          'docker',
          [
            'events',
            '--since',
            '0',
            '--until',
            new Date(Date.now() + 1000).toISOString(),
            '--format',
            '{{json .}}',
          ],
          process.cwd(),
          { timeoutMs: 10000, maxBytes: 16 * 1024 * 1024 }
        );
        const lines = snapshot.toString().trim().split('\n');
        if (lines.length > 10000) throw networkFailure();
        const history = lines.map(safeEvent);
        await new Promise((resolve) => setImmediate(resolve));
        result = networkCoverageProof(
          journal,
          history,
          ready,
          end,
          projectId,
          networkId
        );
      } catch {
        failed = true;
      } finally {
        if (child.exitCode !== null || child.signalCode !== null) failed = true;
        retiring = true;
        child.kill('SIGTERM');
        observerDrained = await drainObserverGroup(child, closed);
        if (!observerDrained) {
          child.stdout.destroy();
          child.stderr.destroy();
        }
        clearTimeout(deadline);
      }
      return {
        ...result,
        qualified:
          result.qualified && !failed && !pending.trim() && observerDrained,
        observerDrained,
      };
    },
  };
}

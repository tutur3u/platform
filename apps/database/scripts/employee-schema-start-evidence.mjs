import { fork, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  emptyEmployeeStartEvidence,
  employeeStartEvidenceFields as fields,
  parseEmployeeStartEvidence,
  matchesEmployeeEvidenceNetwork as sameNetwork,
  validateEmployeeStartInput,
  isEmployeeReadyMarker as validMarker,
} from './employee-schema-typegen.mjs';

export {
  emptyEmployeeStartEvidence,
  parseEmployeeStartEvidence,
  validateEmployeeStartInput,
} from './employee-schema-typegen.mjs';

/** A literal await-boundary label, never an exception, selected reply, or private path. */
export function startupAdmissionDiagnostic(stage) {
  return [
    'worker-initialize',
    'primary-network-ready',
    'worker-network-ready',
    'observer-health',
    'admitted',
  ].includes(stage)
    ? stage
    : 'unknown';
}

const fail = () => new Error('Employee startup evidence unavailable');
const daemon = 'unix:///var/run/docker.sock';
const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw fail();
  }
}
/** Bounded fixed Docker reads; children stay in the evidence worker's own group. */
function dockerRead(args, { maxBytes = 65536, timeoutMs = 2500 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--host', daemon, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let bytes = 0,
      denied = false,
      force;
    const stop = () => {
      denied = true;
      child.kill('SIGTERM');
      force ??= setTimeout(() => child.kill('SIGKILL'), 250);
    };
    const timer = setTimeout(stop, timeoutMs);
    child.stderr.resume();
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop();
      else chunks.push(chunk);
    });
    child.on('error', () => {
      denied = true;
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(force);
      if (denied || code !== 0 || signal) reject(fail());
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}
const networkFormat =
  '{"id":{{json .Id}},"name":{{json .Name}},"internal":{{json .Internal}},"driver":{{json .Driver}},"cliProject":{{json (index .Labels "com.supabase.cli.project")}},"labels":{"source":{{json (index .Labels "ttr.employee.source")}},"control":{{json (index .Labels "ttr.employee.control")}},"run":{{json (index .Labels "ttr.employee.run")}},"attempt":{{json (index .Labels "ttr.employee.attempt")}},"nonce":{{json (index .Labels "ttr.employee.nonce")}},"project":{{json (index .Labels "ttr.employee.project")}}}';
const containerFormat =
  '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"mode":{{json .HostConfig.NetworkMode}},"requested":{{json .HostConfig.PortBindings}},"ports":{{json .NetworkSettings.Ports}},"networks":{{json .NetworkSettings.Networks}}}';
/** No authentication or SQL bytes are sent. Always await the exact socket's close. */
export function probeEmployeeLoopback(
  port,
  { connect = net.createConnection, timeoutMs = 500 } = {}
) {
  return new Promise((resolve) => {
    let connected = false,
      refused = false,
      timedOut = false;
    const socket = connect({ host: '127.0.0.1', port });
    const timer = setTimeout(() => {
      timedOut = true;
      socket.destroy();
    }, timeoutMs);
    socket.once('connect', () => {
      connected = true;
      socket.destroy();
    });
    socket.once('error', (error) => {
      refused = error.code === 'ECONNREFUSED';
      socket.destroy();
    });
    socket.once('close', () => {
      clearTimeout(timer);
      resolve({ connected, refused, timedOut });
    });
  });
}
function snapshotIdentity(snapshot, input, id) {
  return (
    snapshot?.id === id &&
    snapshot?.name === `/supabase_db_${input.projectId}` &&
    snapshot?.project === input.projectId &&
    snapshot?.image === input.imageRef
  );
}
function ownedEndpoint(snapshot, input) {
  const rows = record(snapshot.networks)
    ? Object.entries(snapshot.networks)
    : [];
  return (
    rows.length === 1 &&
    rows[0][0] === input.network.name &&
    rows[0][1]?.NetworkID === input.network.id &&
    [input.network.id, input.network.name].includes(snapshot.mode)
  );
}
function bindings(value, port, requested = false) {
  const rows = Array.isArray(value?.['5432/tcp']) ? value['5432/tcp'] : [];
  return {
    present: rows.length > 0,
    matches: rows.some(
      (row) =>
        row?.HostPort === String(port) &&
        (requested
          ? ['', '0.0.0.0', '127.0.0.1']
          : ['0.0.0.0', '127.0.0.1']
        ).includes(row.HostIp)
    ),
  };
}
/** Evaluate fixed selected fields only; no foreign or unproven target is probed. */
export async function collectEmployeeDbSnapshot(
  input,
  id,
  { read = dockerRead, probe = probeEmployeeLoopback, probeEnabled = true } = {}
) {
  validateEmployeeStartInput(input);
  const result = emptyEmployeeStartEvidence();
  const inspect = async () =>
    JSON.parse(
      await read([
        'inspect',
        '--type',
        'container',
        '--format',
        containerFormat,
        id,
      ])
    );
  try {
    if (!/^[a-f0-9]{64}$/.test(id ?? '')) throw fail();
    const rootNetwork = JSON.parse(
      await read([
        'network',
        'inspect',
        '--format',
        networkFormat,
        input.network.id,
      ])
    );
    if (!sameNetwork(rootNetwork, input.network)) throw fail();
    const snapshot = await inspect();
    result.containerInspectionSucceeded = true;
    result.ownedContainerIdentityVerified = snapshotIdentity(
      snapshot,
      input,
      id
    );
    result.soleInternalNetworkVerified = ownedEndpoint(snapshot, input);
    if (
      !result.ownedContainerIdentityVerified ||
      !result.soleInternalNetworkVerified
    )
      throw fail();
    const requested = bindings(snapshot.requested, input.dbPort, true),
      effective = bindings(snapshot.ports, input.dbPort);
    result.requested5432MappingPresent = requested.present;
    result.requested5432MappingMatchesChosenPort = requested.matches;
    result.effective5432MappingPresent = effective.present;
    result.effective5432MappingMatchesChosenPort = effective.matches;
    result.healthInspectionSucceeded = [
      'starting',
      'healthy',
      'unhealthy',
    ].includes(snapshot.health);
    result.healthyObserved = snapshot.health === 'healthy';
    result.unhealthyObserved = snapshot.health === 'unhealthy';
    if (snapshot.running !== true || !effective.matches || !requested.matches) {
      result.loopbackProbeSkippedOwnershipUnproven = true;
      return result;
    }
    if (!probeEnabled) return result;
    // Revalidate immediately before touching the published target; never guess a missing binding.
    const fresh = await inspect();
    if (
      !snapshotIdentity(fresh, input, id) ||
      !ownedEndpoint(fresh, input) ||
      fresh.running !== true ||
      !bindings(fresh.ports, input.dbPort).matches ||
      !bindings(fresh.requested, input.dbPort, true).matches
    )
      throw fail();
    if (
      !sameNetwork(
        JSON.parse(
          await read([
            'network',
            'inspect',
            '--format',
            networkFormat,
            input.network.id,
          ])
        ),
        input.network
      )
    )
      throw fail();
    result.loopbackProbeAttempted = true;
    const outcome = await probe(input.dbPort);
    result.loopbackTcpConnected = outcome.connected === true;
    result.loopbackTcpRefused = outcome.refused === true;
    result.loopbackTcpTimedOut = outcome.timedOut === true;
  } catch {
    result.observerUncertain = true;
    result.loopbackProbeSkippedOwnershipUnproven ||=
      !result.loopbackProbeAttempted;
    result.inspectionLostBeforeTeardown = true;
  }
  return result;
}
function combine(target, source) {
  for (const key of fields) target[key] ||= source[key];
}
/** Source-only injectable observer core; production entry always uses fixed Docker readers. */
export async function createEmployeeEvidenceObserver(
  input,
  {
    read = dockerRead,
    spawnEvents = spawn,
    probe = probeEmployeeLoopback,
    waitMs = 5000,
  } = {}
) {
  validateEmployeeStartInput(input);
  const result = emptyEmployeeStartEvidence();
  const root = JSON.parse(
    await read([
      'network',
      'inspect',
      '--format',
      networkFormat,
      input.network.id,
    ])
  );
  if (!sameNetwork(root, input.network)) throw fail();
  try {
    const version = (
      await read(['version', '--format', '{{.Server.Version}}'], {
        maxBytes: 1024,
      })
    ).trim();
    result.daemonVersionInspectionSucceeded =
      /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version);
    result.daemonMatchesReviewedMoby28_0_4 = version === '28.0.4';
  } catch {
    result.observerUncertain = true;
  }
  const child = spawnEvents(
    'docker',
    ['--host', daemon, 'events', '--since', '0', '--format', '{{json .}}'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const closed = new Promise((resolve) => child.once('close', resolve));
  let pending = '',
    bytes = 0,
    count = 0,
    retiring = false,
    admission = false,
    targetId,
    observations = 0,
    readbacks = 0,
    streamFailed = false,
    queue = Promise.resolve();
  const markers = new Map(),
    wakes = new Set();
  child.stderr.resume();
  child.once('error', () => {
    streamFailed = true;
    result.observerUncertain = true;
    for (const wake of wakes) wake();
  });
  child.once('close', () => {
    if (!retiring) {
      streamFailed = true;
      result.observerUncertain = true;
    }
    for (const wake of wakes) wake();
  });
  child.stdout.on('data', (chunk) => {
    bytes += chunk.length;
    pending += chunk.toString();
    if (bytes > 16 * 1024 * 1024 || pending.length > 262144) {
      streamFailed = true;
      result.observerUncertain = true;
      child.kill('SIGTERM');
      return;
    }
    let at = pending.indexOf('\n');
    while (at >= 0) {
      const line = pending.slice(0, at);
      pending = pending.slice(at + 1);
      at = pending.indexOf('\n');
      count++;
      try {
        if (count > 10000) throw fail();
        const event = JSON.parse(line),
          attrs = event.Actor?.Attributes;
        if (event.Type === 'network' && event.Action === 'create')
          markers.set(event.Actor?.ID, attrs?.name);
        if (
          !admission ||
          event.Type !== 'container' ||
          attrs?.['com.supabase.cli.project'] !== input.projectId ||
          attrs?.name !== `supabase_db_${input.projectId}` ||
          !/^[a-f0-9]{64}$/.test(event.Actor?.ID ?? '')
        )
          continue;
        targetId ??= event.Actor.ID;
        if (event.Actor.ID !== targetId) continue; // This unit describes only the initial START generation.
        if (['die', 'destroy'].includes(event.Action)) {
          admission = false;
          continue;
        }
        if (
          ![
            'start',
            'health_status: healthy',
            'health_status: unhealthy',
          ].includes(event.Action) ||
          observations >= 3
        )
          continue;
        observations++;
        const id = event.Actor.ID;
        queue = queue.then(async () => {
          const limitedRead = (args, options) => {
            if (args[0] === 'inspect' && ++readbacks > 3)
              return Promise.reject(fail());
            return read(args, options);
          };
          combine(
            result,
            await collectEmployeeDbSnapshot(input, id, {
              read: limitedRead,
              probe,
              probeEnabled: !result.loopbackProbeAttempted,
            })
          );
        });
      } catch {
        streamFailed = true;
        result.observerUncertain = true;
      }
    }
    for (const wake of wakes) wake();
  });
  const wait = (id, name) =>
    new Promise((resolve, reject) => {
      const done = (error) => {
        clearTimeout(timer);
        wakes.delete(wake);
        error ? reject(fail()) : resolve();
      };
      const wake = () => {
        if (
          child.exitCode !== null ||
          child.signalCode !== null ||
          streamFailed
        )
          done(true);
        else if (
          markers.has(id) &&
          (name === undefined || markers.get(id) === name)
        )
          done(false);
      };
      const timer = setTimeout(() => done(true), waitMs);
      wakes.add(wake);
      wake();
    });
  return {
    async ready(marker) {
      if (result.observerReady || !validMarker(marker, input)) throw fail();
      await wait(marker.id, marker.name);
      result.observerReady = true;
      admission = true;
      return { ...result };
    },
    async finish(endId) {
      try {
        if (!result.observerReady || !/^[a-f0-9]{64}$/.test(endId ?? ''))
          throw fail();
        await wait(endId);
        result.observerEndSeen = true;
      } catch {
        result.observerUncertain = true;
      }
      admission = false;
      await queue;
      retiring = true;
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 250);
      await closed;
      clearTimeout(force);
      result.observerUncertain ||= Boolean(pending.trim());
      return { ...result };
    },
  };
}
/** Own exactly one detached worker and reader group; no customer or credential env is inherited. */
export function startEmployeeDbStartEvidence(
  input,
  { forkWorker = fork, rpcMs = 8000, deadlineMs = 25 * 60 * 1000 } = {}
) {
  validateEmployeeStartInput(input);
  const configRoot = mkdtempSync(
    path.join(os.tmpdir(), 'employee-start-docker-config-')
  );
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    DOCKER_CONFIG: configRoot,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS ?? '',
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY ?? '',
    GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME ?? '',
  };
  let child;
  try {
    child = forkWorker(fileURLToPath(import.meta.url), ['--worker'], {
      detached: true,
      execArgv: [],
      env,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
  } catch {
    rmSync(configRoot, { recursive: true, force: true });
    throw fail();
  }
  const closed = new Promise((resolve) => child.once('close', resolve));
  const waiting = new Map();
  let serial = 0,
    ended = false,
    denied = false,
    last = emptyEmployeeStartEvidence();
  const rejectAll = () => {
    denied = true;
    for (const entry of waiting.values()) {
      clearTimeout(entry.timer);
      entry.reject(fail());
    }
    waiting.clear();
  };
  child.on('error', rejectAll);
  child.on('close', rejectAll);
  child.on('message', (message) => {
    try {
      if (
        !record(message) ||
        Object.keys(message).sort().join(',') !== 'id,ok,result' ||
        message.ok !== true ||
        !waiting.has(message.id)
      )
        throw fail();
      const result = parseEmployeeStartEvidence(message.result),
        entry = waiting.get(message.id);
      waiting.delete(message.id);
      clearTimeout(entry.timer);
      last = result;
      entry.resolve(result);
    } catch {
      rejectAll();
    }
  });
  const rpc = (type, value) =>
    new Promise((resolve, reject) => {
      if (denied || ended || !child.connected) {
        reject(fail());
        return;
      }
      const id = ++serial;
      const timer = setTimeout(() => {
        waiting.delete(id);
        denied = true;
        reject(fail());
      }, rpcMs);
      waiting.set(id, { resolve, reject, timer });
      child.send({ type, id, value }, (error) => {
        if (error) rejectAll();
      });
    });
  const terminate = async () => {
    ended = true;
    rejectAll();
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null)
      killGroup(child.pid, 'SIGTERM');
    const force = setTimeout(() => {
      try {
        if (groupExists(child.pid)) killGroup(child.pid, 'SIGKILL');
      } catch {
        denied = true;
      }
    }, 1000);
    await closed;
    const until = Date.now() + 2500;
    while (groupExists(child.pid) && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 25));
    clearTimeout(force);
    if (groupExists(child.pid)) throw fail();
    rmSync(configRoot, { recursive: true, force: true });
  };
  const deadline = setTimeout(() => {
    denied = true;
    if (child.exitCode === null && child.signalCode === null)
      killGroup(child.pid, 'SIGKILL');
    rejectAll();
  }, deadlineMs);
  const initialized = rpc('init', {
    input,
    groupPid: child.pid,
    deadlineMs,
  }).catch((error) => {
    denied = true;
    throw error;
  });
  initialized.catch(() => {}); // Retain the failure until the caller's explicit started() boundary.
  return {
    started: () => initialized,
    async ready(marker) {
      await initialized;
      const result = await rpc('ready', marker);
      if (!result.observerReady) {
        denied = true;
        throw fail();
      }
      return result;
    },
    async finish(endMarkerId) {
      try {
        await initialized;
        if (!denied) await rpc('finish', endMarkerId);
      } catch {
        last.observerUncertain = true;
      }
      try {
        await terminate();
        last.observerDrained = true;
      } catch {
        last.observerUncertain = true;
        throw fail();
      }
      last.observerUncertain ||= denied && !last.observerEndSeen;
      return parseEmployeeStartEvidence(last);
    },
  };
}

if (process.argv[2] === '--worker') {
  let observer,
    first = true,
    expectedId = 1,
    phase = 'initial',
    chain = Promise.resolve(),
    deadline;
  const retire = () => {
    try {
      killGroup(process.pid, 'SIGKILL');
    } catch {
      process.exitCode = 1;
    }
  };
  process.once('disconnect', retire);
  process.on('SIGTERM', retire);
  process.on('message', (message) => {
    chain = chain
      .then(async () => {
        if (
          !record(message) ||
          Object.keys(message).sort().join(',') !== 'id,type,value' ||
          !Number.isInteger(message.id) ||
          message.id !== expectedId++ ||
          Buffer.byteLength(JSON.stringify(message)) > 8192
        )
          throw fail();
        let result;
        if (message.type === 'init' && first) {
          first = false;
          if (
            process.platform !== 'linux' ||
            process.env.GITHUB_ACTIONS !== 'true' ||
            process.env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
            process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
            message.value?.groupPid !== process.pid ||
            Number(
              readFileSync('/proc/self/stat', 'utf8')
                .split(') ')
                .at(-1)
                .split(' ')[2]
            ) !== process.pid ||
            !Number.isInteger(message.value?.deadlineMs) ||
            message.value.deadlineMs < 1000 ||
            message.value.deadlineMs > 25 * 60 * 1000
          )
            throw fail();
          deadline = setTimeout(retire, message.value.deadlineMs);
          observer = await createEmployeeEvidenceObserver(message.value.input);
          phase = 'started';
          result = emptyEmployeeStartEvidence();
        } else if (
          message.type === 'ready' &&
          observer &&
          phase === 'started'
        ) {
          result = await observer.ready(message.value);
          phase = 'ready';
        } else if (message.type === 'finish' && observer && phase === 'ready') {
          result = await observer.finish(message.value);
          phase = 'sealed';
          clearTimeout(deadline);
        } else throw fail();
        process.send?.({ id: message.id, ok: true, result });
      })
      .catch(retire);
  });
}

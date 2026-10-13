import { fork, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  employeeInitAdmissionReason,
  emptyEmployeeRelayEvidence,
  isEmployeeReadyMarker,
  matchesEmployeeEvidenceNetwork,
  parseEmployeeRelayEvidence,
  validateEmployeeRelayPeer,
  validateEmployeeStartInput,
} from './employee-schema-typegen.mjs';

export {
  emptyEmployeeRelayEvidence,
  parseEmployeeRelayEvidence,
  validateEmployeeRelayPeer,
} from './employee-schema-typegen.mjs';

const failure = () => new Error('Employee loopback relay unavailable');
const phases = ['start', 'reset', 'typegen', 'cleanup'];
const daemon = 'unix:///var/run/docker.sock';
const idValid = (id) => /^[a-f0-9]{64}$/.test(id ?? '');
const networkFormat =
  '{"id":{{json .Id}},"name":{{json .Name}},"internal":{{json .Internal}},"driver":{{json .Driver}},"cliProject":{{json (index .Labels "com.supabase.cli.project")}},"labels":{"source":{{json (index .Labels "ttr.employee.source")}},"control":{{json (index .Labels "ttr.employee.control")}},"run":{{json (index .Labels "ttr.employee.run")}},"attempt":{{json (index .Labels "ttr.employee.attempt")}},"nonce":{{json (index .Labels "ttr.employee.nonce")}},"project":{{json (index .Labels "ttr.employee.project")}}},"subnets":{{json .IPAM.Config}}}';
const containerFormat = (input) =>
  `{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"networkCount":{{len .NetworkSettings.Networks}},"endpoint":{{with index .NetworkSettings.Networks "${input.network.name}"}}{"id":{{json .NetworkID}},"ip":{{json .IPAddress}},"prefix":{{json .IPPrefixLen}}}{{else}}null{{end}}}`;
function fixedRead(args) {
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
      force ??= setTimeout(() => child.kill('SIGKILL'), 100);
    };
    const timer = setTimeout(stop, 1000);
    child.stderr.resume();
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 16384) stop();
      else chunks.push(chunk);
    });
    child.once('error', () => {
      denied = true;
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(force);
      if (denied || code !== 0 || signal) reject(failure());
      else {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(failure());
        }
      }
    });
  });
}
/** Injectable socket core; production fixes its Docker reader, peer port and listener address. */
export async function createEmployeeLoopbackRelay(
  input,
  {
    read = fixedRead,
    connect = net.createConnection,
    createServer = net.createServer,
    spawnEvents = spawn,
    connectionMs = 600000,
  } = {}
) {
  validateEmployeeStartInput(input);
  if (
    !Number.isInteger(connectionMs) ||
    connectionMs < 1 ||
    connectionMs > 600000
  )
    throw failure();
  const evidence = emptyEmployeeRelayEvidence(),
    sockets = new Set(),
    closes = new Set(),
    readers = new Set();
  const markers = new Map(),
    wake = new Set(),
    generations = new Set();
  let phase = -1,
    perPhaseReads = 0,
    totalReads = 0,
    accepted = 0,
    phaseBytes = 0;
  let target,
    active = 0,
    pendingClients = 0,
    retired = false,
    admission = false,
    buffered = '',
    eventBytes = 0,
    eventCount = 0;
  let queue = Promise.resolve();
  const deny = () => {
    evidence.denied = true;
    admission = false;
    for (const socket of sockets) socket.destroy();
    for (const fn of wake) fn();
  };
  const selectedRead = async (args) => {
    if (
      evidence.denied ||
      retired ||
      ++perPhaseReads > 128 ||
      ++totalReads > 384
    ) {
      deny();
      throw failure();
    }
    const operation = Promise.resolve().then(() => read(args));
    readers.add(operation);
    try {
      const value = await operation;
      if (evidence.denied || retired) throw failure();
      return value;
    } finally {
      readers.delete(operation);
    }
  };
  const inspectNetwork = () =>
    selectedRead([
      'network',
      'inspect',
      '--format',
      networkFormat,
      input.network.id,
    ]);
  const inspectTarget = async (id) => {
    const network = await inspectNetwork();
    const snapshot = await selectedRead([
      'inspect',
      '--format',
      containerFormat(input),
      id,
    ]);
    if (snapshot.id !== id) throw failure();
    const peer = validateEmployeeRelayPeer(snapshot, network, input);
    const fresh = await inspectNetwork();
    if (JSON.stringify(network) !== JSON.stringify(fresh)) throw failure();
    return peer;
  };
  const initial = await inspectNetwork();
  if (!matchesEmployeeEvidenceNetwork(initial, input.network)) throw failure();
  const events = spawnEvents(
    'docker',
    ['--host', daemon, 'events', '--since', '0', '--format', '{{json .}}'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const eventsClosed = new Promise((resolve) => events.once('close', resolve));
  events.stderr.resume();
  events.once('error', deny);
  events.once('close', () => {
    if (!retired) deny();
  });
  events.stdout.on('data', (chunk) => {
    eventBytes += chunk.length;
    buffered += chunk.toString('utf8');
    if (eventBytes > 16 * 1024 * 1024 || buffered.length > 262144) {
      deny();
      return;
    }
    let at = buffered.indexOf('\n');
    while (at >= 0) {
      const line = buffered.slice(0, at);
      buffered = buffered.slice(at + 1);
      at = buffered.indexOf('\n');
      queue = queue
        .then(async () => {
          if (++eventCount > 10000) throw failure();
          const event = JSON.parse(line),
            attrs = event.Actor?.Attributes,
            id = event.Actor?.ID;
          if (
            event.Type === 'network' &&
            event.Action === 'create' &&
            idValid(id)
          ) {
            markers.set(id, attrs?.name);
            if (markers.size > 10000) throw failure();
          }
          if (
            evidence.markerReady &&
            phase >= 0 &&
            event.Type === 'container' &&
            attrs?.name === `supabase_db_${input.projectId}`
          ) {
            if (
              attrs['com.supabase.cli.project'] !== input.projectId ||
              attrs.image !== input.imageRef ||
              !idValid(id)
            )
              throw failure();
            if (
              ['create', 'start', 'health_status: healthy'].includes(
                event.Action
              )
            ) {
              if (target && target !== id) {
                target = undefined;
                for (const socket of sockets) socket.destroy();
              }
              generations.add(id);
              if (generations.size > 4) throw failure();
              target = id;
            } else if (
              ['destroy', 'die', 'stop', 'health_status: unhealthy'].includes(
                event.Action
              )
            ) {
              if (target === id) {
                target = undefined;
                for (const socket of sockets) socket.destroy();
              }
            }
          }
          for (const fn of wake) fn();
        })
        .catch(deny);
    }
  });
  const tracked = (socket) => {
    sockets.add(socket);
    let closed;
    closed = new Promise((resolve) =>
      socket.once('close', () => {
        sockets.delete(socket);
        closes.delete(closed);
        resolve();
      })
    );
    closes.add(closed);
    socket.on('error', () => socket.destroy());
    return socket;
  };
  const awaitTarget = async () => {
    const end = Date.now() + 5000;
    while (!target && !evidence.denied && !retired && Date.now() < end) {
      await new Promise((resolve) => {
        const timer = setTimeout(done, 100);
        function done() {
          clearTimeout(timer);
          wake.delete(done);
          resolve();
        }
        wake.add(done);
      });
    }
    if (!admission || !target || evidence.denied || retired) throw failure();
    return target;
  };
  const server = createServer({ allowHalfOpen: false }, (client) => {
    tracked(client);
    client.pause();
    if (
      !admission ||
      evidence.denied ||
      retired ||
      ++accepted > 64 ||
      pendingClients >= 8
    ) {
      client.destroy();
      deny();
      return;
    }
    pendingClients++;
    const timer = setTimeout(
      () => {
        client.destroy();
        deny();
      },
      Math.min(connectionMs, phase === 2 ? 300000 : 600000)
    );
    const work = (async () => {
      const id = await awaitTarget();
      const peer = await inspectTarget(id);
      if (target !== id || !admission || client.destroyed || active >= 8)
        throw failure();
      pendingClients--;
      active++;
      evidence.targetVerified = true;
      const upstream = tracked(
        connect({ host: peer.host, port: 5432, allowHalfOpen: false })
      );
      upstream.on('error', () => {
        if (admission) deny();
      });
      let connectionBytes = 0;
      const bytes = (chunk) => {
        connectionBytes += chunk.length;
        phaseBytes += chunk.length;
        if (
          connectionBytes > 64 * 1024 * 1024 ||
          phaseBytes > 512 * 1024 * 1024
        )
          deny();
      };
      client.on('data', bytes);
      upstream.on('data', bytes);
      upstream.once('connect', () => {
        evidence.connected = true;
        client.pipe(upstream);
        upstream.pipe(client);
        client.resume();
      });
      client.once('close', () => upstream.destroy());
      upstream.once('close', () => {
        client.destroy();
        active--;
      });
      await new Promise((resolve) => client.once('close', resolve));
    })()
      .catch(() => {
        pendingClients = Math.max(0, pendingClients - 1);
        client.destroy();
        deny();
      })
      .finally(() => clearTimeout(timer));
    readers.add(work);
    work.finally(() => readers.delete(work));
  });
  const serverClosed = new Promise((resolve) => server.once('close', resolve));
  server.on('error', deny);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(
        { host: '127.0.0.1', port: input.dbPort, exclusive: true },
        resolve
      );
    });
  } catch {
    deny();
    retired = true;
    events.kill('SIGKILL');
    await eventsClosed;
    throw failure();
  }
  evidence.listenerReady = true;
  const barrier = async (id, name) => {
    if (!idValid(id) || typeof name !== 'string') throw failure();
    const end = Date.now() + 5000;
    while (markers.get(id) !== name && !evidence.denied && Date.now() < end) {
      await new Promise((resolve) => {
        const timer = setTimeout(done, 100);
        function done() {
          clearTimeout(timer);
          wake.delete(done);
          resolve();
        }
        wake.add(done);
      });
    }
    await queue;
    if (evidence.denied || markers.get(id) !== name) throw failure();
  };
  return {
    snapshot: () => ({ ...evidence }),
    async ready(marker) {
      if (!isEmployeeReadyMarker(marker, input)) throw failure();
      await barrier(marker.id, marker.name);
      evidence.markerReady = true;
      return { ...evidence };
    },
    async phase(next) {
      if (
        !evidence.markerReady ||
        evidence.denied ||
        (next !== 'cleanup' && phases.indexOf(next) !== phase + 1) ||
        !phases.includes(next)
      )
        throw failure();
      admission = false;
      for (const socket of sockets) socket.destroy();
      await Promise.all([...closes]);
      await Promise.all([...readers]);
      phase = phases.indexOf(next);
      perPhaseReads = 0;
      accepted = 0;
      phaseBytes = 0;
      admission = next !== 'cleanup';
      return { ...evidence };
    },
    async finish(endId) {
      let bad = false;
      try {
        const until = Date.now() + 5000;
        while (!markers.has(endId) && !evidence.denied && Date.now() < until)
          await new Promise((resolve) => setTimeout(resolve, 25));
        const name = markers.get(endId);
        if (
          !new RegExp(`^${input.network.name}-end-[a-f0-9]{8}$`).test(
            name ?? ''
          )
        )
          throw failure();
        await barrier(endId, name);
      } catch {
        bad = true;
      }
      admission = false;
      retired = true;
      for (const socket of sockets) socket.destroy();
      server.close();
      await Promise.all([...closes]);
      await Promise.all([...readers]);
      await serverClosed;
      await queue;
      events.kill('SIGTERM');
      const force = setTimeout(() => events.kill('SIGKILL'), 250);
      await eventsClosed;
      clearTimeout(force);
      await queue;
      evidence.denied ||= bad || Boolean(buffered.trim());
      evidence.drained = true;
      return { ...evidence };
    },
  };
}

function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
/** Parent owns one minimal-environment worker/group; no credential or arbitrary target crosses IPC. */
export function startEmployeeLoopbackRelay(
  input,
  { forkWorker = fork, rpcMs = 8000, deadlineMs = 25 * 60 * 1000 } = {}
) {
  validateEmployeeStartInput(input);
  const config = mkdtempSync(path.join(os.tmpdir(), 'employee-relay-config-')),
    nonce = randomUUID();
  const removeConfig = () => {
    try {
      rmSync(config, { recursive: true, force: true });
    } catch {
      throw failure();
    }
  };
  let child;
  try {
    child = forkWorker(fileURLToPath(import.meta.url), ['--worker'], {
      detached: true,
      execArgv: [],
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        DOCKER_CONFIG: config,
        GITHUB_ACTIONS: process.env.GITHUB_ACTIONS ?? '',
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY ?? '',
        GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME ?? '',
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
  } catch {
    removeConfig();
    throw failure();
  }
  const closed = new Promise((resolve) => child.once('close', resolve)),
    waiting = new Map();
  let serial = 0,
    denied = false,
    ended = false,
    evidence = emptyEmployeeRelayEvidence();
  const rejectAll = () => {
    denied = true;
    for (const entry of waiting.values()) {
      clearTimeout(entry.timer);
      entry.reject(failure());
    }
    waiting.clear();
  };
  child.on('error', rejectAll);
  child.on('close', rejectAll);
  child.on('message', (message) => {
    try {
      if (
        !message ||
        Object.keys(message).sort().join(',') !== 'id,nonce,ok,result' ||
        message.nonce !== nonce ||
        message.ok !== true ||
        !waiting.has(message.id)
      )
        throw failure();
      evidence = parseEmployeeRelayEvidence(message.result);
      if (evidence.denied) throw failure();
      const entry = waiting.get(message.id);
      waiting.delete(message.id);
      clearTimeout(entry.timer);
      entry.resolve({ ...evidence });
    } catch {
      rejectAll();
    }
  });
  const rpc = (type, value) =>
    new Promise((resolve, reject) => {
      if (denied || ended || !child.connected) {
        reject(failure());
        return;
      }
      const id = ++serial,
        timer = setTimeout(() => {
          rejectAll();
        }, rpcMs);
      waiting.set(id, { resolve, reject, timer });
      child.send({ id, nonce, type, value }, (error) => {
        if (error) rejectAll();
      });
    });
  const deadline = setTimeout(() => {
    rejectAll();
    if (groupExists(child.pid)) process.kill(-child.pid, 'SIGKILL');
  }, deadlineMs);
  const started = rpc('init', { input, groupPid: child.pid, deadlineMs });
  started.catch(() => {});
  return {
    started: () => started,
    ready: (marker) => rpc('ready', marker),
    phase: (name) => rpc('phase', name),
    async finish(endId) {
      try {
        await started;
        if (!denied) evidence = await rpc('finish', endId);
      } catch {
        evidence.denied = true;
      }
      ended = true;
      rejectAll();
      clearTimeout(deadline);
      if (groupExists(child.pid)) process.kill(-child.pid, 'SIGTERM');
      const force = setTimeout(() => {
        if (groupExists(child.pid)) process.kill(-child.pid, 'SIGKILL');
      }, 250);
      await closed;
      const until = Date.now() + 2500;
      while (groupExists(child.pid) && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 25));
      clearTimeout(force);
      if (groupExists(child.pid)) throw failure();
      removeConfig();
      evidence.drained = true;
      return { ...evidence };
    },
  };
}
if (
  process.argv[1] === fileURLToPath(import.meta.url) &&
  process.argv[2] === '--worker'
) {
  let core,
    first = true,
    next = 1,
    nonce,
    deadline,
    chain = Promise.resolve();
  const retire = () => {
    try {
      process.kill(-process.pid, 'SIGKILL');
    } catch {
      process.exitCode = 1;
    }
  };
  process.once('disconnect', retire);
  process.once('SIGTERM', retire);
  process.on('message', (message) => {
    chain = chain
      .then(async () => {
        if (
          !message ||
          Object.keys(message).sort().join(',') !== 'id,nonce,type,value' ||
          message.id !== next++ ||
          typeof message.nonce !== 'string' ||
          Buffer.byteLength(JSON.stringify(message)) > 8192 ||
          (!first && message.nonce !== nonce)
        )
          throw failure();
        let result;
        if (message.type === 'init' && first) {
          first = false;
          nonce = message.nonce;
          const group =
            process.platform === 'linux'
              ? Number(
                  readFileSync('/proc/self/stat', 'utf8')
                    .split(') ')
                    .at(-1)
                    .split(' ')[2]
                )
              : null;
          if (
            employeeInitAdmissionReason(message.value, {
              platform: process.platform,
              actions: process.env.GITHUB_ACTIONS,
              repository: process.env.GITHUB_REPOSITORY,
              event: process.env.GITHUB_EVENT_NAME,
              pid: process.pid,
              group,
            }) !== 'none'
          )
            throw failure();
          deadline = setTimeout(retire, message.value.deadlineMs);
          core = await createEmployeeLoopbackRelay(message.value.input);
          result = core.snapshot();
        } else if (core && message.type === 'ready')
          result = await core.ready(message.value);
        else if (core && message.type === 'phase')
          result = await core.phase(message.value);
        else if (core && message.type === 'finish') {
          result = await core.finish(message.value);
          clearTimeout(deadline);
        } else throw failure();
        process.send?.({ id: message.id, nonce, ok: true, result });
      })
      .catch(retire);
  });
}

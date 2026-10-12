import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cpus, homedir } from 'node:os';
import path from 'node:path';
import { requireCommand } from './employee-validation-command.mjs';

export function daemonArguments(context = null) {
  return context ? [...context.dockerArgs] : [...dockerPrefix];
}
export const dockerPrefix = ['--host', 'unix:///var/run/docker.sock'];
// Accepted protected16 metadata only. No PKTM command ever targets these IDs.
export const protectedBaseline = [
  {
    id: 'dfbd0ba6ff48',
    name: 'pktm-cloudflared',
    state: 'running',
    health: 'healthy',
  },
  {
    id: 'f4a6e18e9135',
    name: 'pktm-legacy-chat-bridge-1',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '0f8fbf39bbf5',
    name: 'pktm-legacy-chat-socket-blue',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '4a35e9f35f02',
    name: 'pktm-legacy-chat-socket-green',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '377514554cc2',
    name: 'pktm-legacy-db',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '57fc3012b978',
    name: 'pktm-legacy-db-backup-1',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '31200d3f55d0',
    name: 'pktm-legacy-db-sync-1',
    state: 'exited',
    health: 'none',
  },
  {
    id: '3100d2035d21',
    name: 'pktm-legacy-php-blue',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '8c0bb1bc313e',
    name: 'pktm-legacy-php-green',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '627186ca374d',
    name: 'pktm-legacy-postgres',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '13956a7e95b1',
    name: 'pktm-legacy-proxy',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '9c984243ec46',
    name: 'pktm-legacy-socket-blue',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '8fbeb9fbbae7',
    name: 'pktm-legacy-socket-green',
    state: 'running',
    health: 'healthy',
  },
  {
    id: '003e77a5f728',
    name: 'pktm-legacy-watchdog',
    state: 'running',
    health: 'none',
  },
  {
    id: 'd77192423b98',
    name: 'pktm-modern-buouco-blue',
    state: 'running',
    health: 'healthy',
  },
  {
    id: 'd5c5b2dbf748',
    name: 'pktm-modern-buouco-green',
    state: 'running',
    health: 'healthy',
  },
];
export function ancestors(rows, pid = process.pid) {
  const result = new Set();
  while (pid && !result.has(pid)) {
    result.add(pid);
    pid = rows.find((row) => row.pid === pid)?.ppid;
  }
  return result;
}
export function parseProcesses(text) {
  return text.split('\n').flatMap((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/u);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }] : [];
  });
}
export function foreignGates(rows, ownAncestors) {
  return rows
    .filter(
      (row) =>
        !ownAncestors.has(row.pid) &&
        /supabase[^\n]*(start|reset|test db|gen types)|employee_types_|verify-(periodic|infrastructure|employee)|run-supabase-isolated/u.test(
          row.args
        ) &&
        !/^ps -eo/u.test(row.args)
    )
    .map((row) => row.pid);
}
export function parseInventory(text) {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, name, state, status] = line.split('\t');
      const health = status.includes('(healthy)')
        ? 'healthy'
        : status.includes('(unhealthy)')
          ? 'unhealthy'
          : status.includes('(health:')
            ? 'starting'
            : 'none';
      return { id, name, state, health };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function verifyBaseline(containers) {
  assert.deepEqual(
    containers,
    protectedBaseline,
    'Protected16 IDs/state/health changed or foreign containers exist'
  );
}
export function verifyHostBudget(admission, host) {
  assert.equal(host.platform, 'linux');
  assert.equal(host.machineId.trim(), admission.host.machineId, 'Wrong host');
  assert(
    host.totalBytes >= 30 * 1024 ** 3 && host.totalBytes <= 32 * 1024 ** 3,
    'Wrong shared32 host memory'
  );
  assert(
    host.availableBytes >= 16 * 1024 ** 3,
    'Insufficient startup headroom'
  );
  assert.equal(host.cpus, 20, 'Wrong shared32 CPU inventory');
  assert(
    Number.isFinite(host.load) && host.load >= 0 && host.load <= host.cpus / 2,
    'Host load admission failed'
  );
  assert.equal(host.insideBroker, true, 'Fresh budget must be inside broker');
  assert.deepEqual(host.foreignGatePids, [], 'Foreign gate process');
  verifyBaseline(host.containers);
}
export async function containerInventory(
  root,
  run = requireCommand,
  context = null
) {
  if (context) run = context.run;
  const result = await run(
    'docker',
    [
      ...daemonArguments(context),
      'ps',
      '-a',
      '--format',
      '{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Status}}',
    ],
    root,
    { timeoutMs: 10000, phase: 'container-inventory' }
  );
  return parseInventory(result.stdout);
}
export async function checkStartup(
  root,
  admission,
  run = requireCommand,
  context = null
) {
  if (admission.version === 2) {
    assert(context, 'Dedicated supervisor required');
    assert.equal(root, context.lease.binding.host.executionRoot);
    await context.attest();
    return {
      profile: 'dedicated-contract-only',
      recoveryId: context.lease.recoveryId,
      generation: context.lease.generation,
    };
  }
  const result = await run('ps', ['-eo', 'pid,ppid,args'], root, {
    timeoutMs: 10000,
    phase: 'broker-process-check',
  });
  const rows = parseProcesses(result.stdout);
  const own = ancestors(rows);
  const owner = JSON.parse(
    readFileSync(
      path.join(homedir(), '.tuturuuu/resources/lock/owner.json'),
      'utf8'
    )
  );
  const mem = readFileSync('/proc/meminfo', 'utf8');
  const memory = (name) =>
    Number(mem.match(new RegExp(`^${name}:\\s+(\\d+) kB$`, 'm'))?.[1]) * 1024;
  const receipt = {
    platform: process.platform,
    machineId: readFileSync('/etc/machine-id', 'utf8'),
    totalBytes: memory('MemTotal'),
    availableBytes: memory('MemAvailable'),
    cpus: cpus().length,
    load: Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]),
    insideBroker:
      own.has(owner.pid) &&
      owner.pid !== process.pid &&
      own.has(owner.childPid),
    foreignGatePids: foreignGates(rows, own),
    containers: await containerInventory(root, run),
  };
  verifyHostBudget(admission, receipt);
  const imageList = await run(
    'docker',
    [
      ...daemonArguments(context),
      'image',
      'ls',
      '--no-trunc',
      '--format',
      '{{.Repository}}:{{.Tag}}\t{{.ID}}',
    ],
    root,
    { timeoutMs: 10000, phase: 'image-selection-inventory' }
  );
  verifyImageSelection(admission.images, imageList.stdout);
  for (const image of admission.images) {
    const found = await run(
      'docker',
      [
        ...daemonArguments(context),
        'image',
        'inspect',
        '--format',
        '{{.Id}}\n{{json .RepoDigests}}',
        image.reference,
      ],
      root,
      { timeoutMs: 10000, phase: 'installed-image-check' }
    );
    const [id, digests] = found.stdout.trim().split('\n');
    assert.equal(id, image.id, 'Installed image changed');
    assert(
      JSON.parse(digests).includes(image.digest),
      'Installed image digest absent'
    );
  }
  return { ...receipt, checkedAt: new Date().toISOString() };
}

export function verifyImageSelection(images, inventory) {
  const installed = new Map(
    inventory
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'))
  );
  for (const image of images) {
    const pin = image.reference.split('/').at(-1);
    const selected = [
      `public.ecr.aws/supabase/${pin}`,
      `ghcr.io/supabase/${pin}`,
      `supabase/${pin}`,
    ].find((reference) => installed.has(reference));
    assert.equal(
      selected,
      image.reference,
      'Effective CLI candidate selection changed or missing'
    );
    assert.equal(
      installed.get(selected),
      image.id,
      'Effective CLI image identity changed'
    );
  }
}

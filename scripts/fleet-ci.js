#!/usr/bin/env node
'use strict';

// Run the CI-equivalent check set for one commit, sharded across the fleet.
// Each admitted host checks the exact commit out in a scratch worktree under
// <repo>/.worktrees/fleet-ci-*, installs, runs its shards through its own
// `ttr resources` queue when available, and the worktrees are always removed.
// See apps/docs/build/development-tools/fleet-ci.mdx.

const { execFileSync, spawn } = require('node:child_process');
const { createWriteStream, mkdirSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { resolveHosts } = require('./fleet-ci/hosts.js');
const { ADMISSION_REFUSED, runScript } = require('./fleet-ci/remote.js');
const {
  canRun,
  simulate,
  takeShard,
  unplaceable,
} = require('./fleet-ci/scheduler.js');
const { SETUPS, defaultShards, selectShards } = require('./fleet-ci/shards.js');

// The Node major every CI job uses (actions/setup-node node-version).
const CI_NODE_MAJOR = 24;

const USAGE = `Usage: bun fleet:ci [options]
  --sha <rev>          commit to check (default HEAD); unpushed commits are bundled
  --hosts a,b          restrict to these host ids (default: every fleet host)
  --only id,prefix*    run only matching shards (e.g. root-scripts-*,oxlint)
  --config <file>      JSON array of hosts replacing the built-in list
  --timeout <minutes>  per-shard timeout (default 45)
  --out <dir>          log directory (default: $TMPDIR/fleet-ci-<sha>)
  --plan               print admission and placement without running
  --sweep              stop and remove leftover fleet-ci worktrees on every host
                       (after an interrupted run; never while another run is active)
  --list               print the shard catalog`;

function parseArgs(argv) {
  const options = { sha: 'HEAD', timeout: 45 };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '--sha') options.sha = value();
    else if (arg === '--hosts') options.hosts = value().split(',');
    else if (arg === '--only') options.only = value().split(',');
    else if (arg === '--config') options.config = value();
    else if (arg === '--timeout') options.timeout = Number(value());
    else if (arg === '--out') options.out = value();
    else if (arg === '--plan') options.plan = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--sweep') options.sweep = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option ${arg}\n${USAGE}`);
  }
  if (!(options.timeout > 0)) throw new Error('--timeout must be positive');
  return options;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function localRepo() {
  return resolve(
    git('rev-parse', '--path-format=absolute', '--git-common-dir'),
    '..'
  );
}

async function admit(hosts, repo, log) {
  const admitted = [];
  await Promise.all(
    hosts.map(async (host) => {
      const target = { ...host, repo: host.repo ?? repo };
      const probe = await runScript(target, 'probe', [target.repo], {
        timeoutMs: 30_000,
      });
      let facts;
      try {
        facts = JSON.parse(probe.stdout.trim().split('\n').at(-1));
      } catch {
        log(
          `- ${host.id}: unreachable (${probe.stderr.trim().split('\n')[0] || probe.code})`
        );
        return;
      }
      if (!facts.bun) return log(`- ${host.id}: refused, bun is missing`);
      if (facts.node !== CI_NODE_MAJOR)
        return log(
          `- ${host.id}: refused, Node ${facts.node} (CI uses Node ${CI_NODE_MAJOR}; install ~/tools/pinned-${CI_NODE_MAJOR}.*)`
        );
      if (facts.freeGiB < host.minFreeGiB)
        return log(
          `- ${host.id}: refused, ${facts.freeGiB} GiB free < ${host.minFreeGiB} GiB floor`
        );
      // Leave headroom for whatever the host is already running.
      const busy = Math.floor(
        facts.load1 / Math.max(1, facts.cpus / host.slots)
      );
      const slots = Math.max(1, host.slots - busy);
      log(
        `- ${host.id}: admitted, ${slots}/${host.slots} slot(s), ${facts.freeGiB} GiB free, load ${facts.load1}/${facts.cpus} cpu`
      );
      admitted.push({
        ...target,
        slots,
        capabilities: facts.redis ? ['redis'] : [],
      });
    })
  );
  return admitted.sort((a, b) => b.slots - a.slots);
}

async function sweep(hosts, repo) {
  await Promise.all(
    hosts.map(async (host) => {
      const target = { ...host, repo: host.repo ?? repo };
      const listed = await runScript(target, 'list', [target.repo], {
        timeoutMs: 30_000,
      });
      if (listed.code !== 0) return console.log(`${host.id}: unreachable`);
      const names = listed.stdout.split('\n').filter(Boolean);
      for (const name of names) {
        const r = await runScript(target, 'cleanup', [target.repo, name], {
          timeoutMs: 300_000,
        });
        console.log(
          `${host.id}: ${name} ${r.code === 0 ? 'removed' : 'failed'}`
        );
      }
      if (!names.length) console.log(`${host.id}: clean`);
    })
  );
}

async function uploadBundle(host, file, remotePath) {
  if (!host.ssh) return file;
  await new Promise((done, fail) => {
    const child = spawn(
      'ssh',
      ['-o', 'BatchMode=yes', host.ssh, `cat > '${remotePath}'`],
      { stdio: ['pipe', 'ignore', 'inherit'] }
    );
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error(`upload to ${host.id} failed`))
    );
    child.stdin.end(readFileSync(file));
  });
  return remotePath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(USAGE);
  const shards = selectShards(defaultShards(), options.only);
  if (options.list) {
    for (const shard of shards)
      console.log(
        `${shard.id.padEnd(16)} ${String(shard.weight).padStart(2)}m ${shard.builds ? 'builds ' : '       '} ${shard.workflow}`
      );
    return;
  }
  const config = options.config
    ? JSON.parse(readFileSync(options.config, 'utf8'))
    : undefined;
  const hosts = resolveHosts({ config, only: options.hosts });
  if (options.sweep) return sweep(hosts, localRepo());
  const sha = git('rev-parse', '--verify', `${options.sha}^{commit}`);
  const short = sha.slice(0, 10);
  const repo = localRepo();
  const log = (line) => console.log(line);
  log(
    `fleet:ci ${short}: ${shards.length} shard(s) across ${hosts.map((h) => h.id).join(', ')}`
  );
  const admitted = await admit(hosts, repo, log);
  const blocked = unplaceable(admitted, shards);
  if (options.plan) {
    const preview = simulate(admitted, shards);
    for (const item of preview.placed)
      log(
        `  ${item.host.padEnd(15)} ${item.shard.padEnd(16)} ~${item.start.toFixed(0)}-${item.end.toFixed(0)}m`
      );
    if (blocked.length)
      log(`unplaceable: ${blocked.map((s) => s.id).join(', ')}`);
    log(
      `estimated critical path ~${preview.minutes.toFixed(0)}m after install`
    );
    return;
  }
  if (!admitted.length) throw new Error('No fleet host was admitted.');

  const name = `fleet-ci-${short}-${process.pid}`;
  const out = resolve(options.out ?? join(tmpdir(), `fleet-ci-${short}`));
  mkdirSync(out, { recursive: true });
  let bundle = null;
  let pushed = true;
  try {
    git('merge-base', '--is-ancestor', sha, 'origin/main');
  } catch {
    pushed = git('branch', '-r', '--contains', sha).length > 0;
  }
  if (!pushed) {
    git('update-ref', `refs/fleet-ci/${name}`, sha);
    bundle = join(out, `${name}.bundle`);
    git('bundle', 'create', bundle, `refs/fleet-ci/${name}`, '^origin/main');
    git('update-ref', '-d', `refs/fleet-ci/${name}`);
  }

  const prepared = [];
  const results = [];
  const started = Date.now();
  let interrupted = false;
  const cleanup = async () => {
    await Promise.all(
      prepared.map((host) =>
        runScript(host, 'cleanup', [host.repo, name], {
          timeoutMs: 120_000,
        }).then((r) =>
          log(
            `cleanup ${host.id}: ${r.code === 0 ? 'removed' : `failed (${r.stderr.trim()})`}`
          )
        )
      )
    );
  };
  const onSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const pending = [...shards.filter((shard) => !blocked.includes(shard))];
    for (const shard of blocked)
      results.push({ id: shard.id, host: '-', status: 'unplaced', minutes: 0 });
    await Promise.all(
      admitted.map(async (host) => {
        if (!pending.some((shard) => canRun(host, shard))) return;
        const t0 = Date.now();
        const remoteBundle = bundle
          ? await uploadBundle(host, bundle, `/tmp/${name}.bundle`)
          : '';
        prepared.push(host);
        const prep = await runScript(
          host,
          'prepare',
          [host.repo, sha, name, remoteBundle, host.ttrRuntime ?? ''],
          {
            timeoutMs: 20 * 60_000,
          }
        );
        if (prep.code !== 0) {
          log(
            `! ${host.id}: prepare failed (${prep.code}) ${prep.stderr.trim().split('\n').slice(-3).join(' | ')}`
          );
          return;
        }
        const gate = /FLEET_CI_GATE=(\w+)/u.exec(prep.stdout)?.[1] ?? 'none';
        log(
          `~ ${host.id}: ready in ${((Date.now() - t0) / 60_000).toFixed(1)}m (queue: ${gate})`
        );
        const wt = `${host.repo}/.worktrees/${name}`;
        const exec = (command, file) => {
          const stream = createWriteStream(file);
          return runScript(
            host,
            'run',
            [
              wt,
              gate,
              Buffer.from(command).toString('base64'),
              host.ttrRuntime ?? '',
            ],
            {
              onData: (chunk) => stream.write(chunk),
              timeoutMs: options.timeout * 60_000,
            }
          ).finally(() => stream.end());
        };
        // Shared setup (e.g. the workspace package build) runs once per host,
        // before the first shard that needs it, so shards never race on dist/.
        const setups = new Map();
        const setup = (shard) => {
          if (!shard.setup) return Promise.resolve(0);
          if (!setups.has(shard.setup)) {
            log(`> setup ${shard.setup} on ${host.id}`);
            setups.set(
              shard.setup,
              exec(
                SETUPS[shard.setup],
                join(out, `setup-${shard.setup}-${host.id}.log`)
              ).then((r) => r.code)
            );
          }
          return setups.get(shard.setup);
        };
        let drained = false;
        await Promise.all(
          Array.from({ length: host.slots }, async () => {
            for (;;) {
              if (interrupted || drained) return;
              const shard = takeShard(host, pending);
              if (!shard) return;
              const file = join(out, `${shard.id}.log`);
              const s0 = Date.now();
              const setupCode = await setup(shard);
              if (setupCode !== 0) {
                results.push({
                  id: shard.id,
                  host: host.id,
                  status: 'setup',
                  minutes: 0,
                  file: join(out, `setup-${shard.setup}-${host.id}.log`),
                });
                log(
                  `FAIL ${shard.id} on ${host.id}: setup ${shard.setup} failed`
                );
                continue;
              }
              log(`> ${shard.id} on ${host.id}`);
              const run = await exec(shard.command, file);
              const minutes = (Date.now() - s0) / 60_000;
              if (run.code === ADMISSION_REFUSED && gate === 'ttr') {
                log(`  ${host.id} refused admission for ${shard.id}; requeued`);
                drained = true;
                pending.push(shard);
                return;
              }
              const status =
                run.code === 0 ? 'pass' : run.code === 124 ? 'timeout' : 'fail';
              results.push({
                id: shard.id,
                host: host.id,
                status,
                minutes,
                file,
              });
              log(
                `${status === 'pass' ? 'ok' : 'FAIL'} ${shard.id} on ${host.id} in ${minutes.toFixed(1)}m`
              );
            }
          })
        );
      })
    );
    for (const shard of pending)
      results.push({ id: shard.id, host: '-', status: 'not run', minutes: 0 });
  } finally {
    await cleanup();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  log(
    `\nfleet:ci ${short} finished in ${((Date.now() - started) / 60_000).toFixed(1)}m; logs in ${out}`
  );
  for (const r of results.sort((a, b) => a.id.localeCompare(b.id)))
    log(
      `  ${r.status.padEnd(8)} ${r.id.padEnd(16)} ${r.host.padEnd(15)} ${r.minutes.toFixed(1)}m`
    );
  const failed = results.filter((r) => r.status !== 'pass');
  for (const r of failed.filter((r) => r.file)) {
    const tail = readFileSync(r.file, 'utf8').split('\n').slice(-25).join('\n');
    log(`\n--- ${r.id} (${r.host}) last lines ---\n${tail}`);
  }
  process.exitCode = failed.length || interrupted ? 1 : 0;
}

if (require.main === module)
  main().catch((error) => {
    console.error(`fleet:ci: ${error.message}`);
    process.exitCode = 1;
  });

module.exports = { parseArgs };

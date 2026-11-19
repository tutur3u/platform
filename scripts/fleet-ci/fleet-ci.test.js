const assert = require('node:assert/strict');
const test = require('node:test');
const { parseArgs } = require('../fleet-ci.js');
const {
  DEFAULT_HOSTS,
  LOCAL_HOST,
  isRefusedHost,
  loadHostConfig,
  resolveHosts,
} = require('./hosts.js');
const { SCRIPTS, quote, runScript } = require('./remote.js');
const { canRun, simulate, takeShard, unplaceable } = require('./scheduler.js');
const {
  SETUPS,
  defaultShards,
  rootScriptCommand,
  selectShards,
} = require('./shards.js');

test('the production server is never a fleet target', () => {
  for (const name of [
    'skr-linux',
    'SKR-LINUX',
    'user@sokora-ubuntu',
    'skr-linux-lan.local',
  ])
    assert.equal(isRefusedHost(name), true, name);
  assert.equal(isRefusedHost('build-box'), false);
  assert.deepEqual(DEFAULT_HOSTS, [LOCAL_HOST]);
  assert.throws(
    () => resolveHosts({ only: ['skr-linux'] }),
    /production server/u
  );
  assert.throws(
    () =>
      resolveHosts({
        config: [
          { id: 'box', ssh: 'sokora-ubuntu', repo: '/srv/repo', slots: 1 },
        ],
      }),
    /production server/u
  );
});

test('host config rejects shell-unsafe values and unknown ids', () => {
  assert.throws(() =>
    resolveHosts({ config: [{ id: 'a', ssh: 'a;rm', repo: '/r', slots: 1 }] })
  );
  assert.throws(() =>
    resolveHosts({ config: [{ id: 'a', ssh: 'a', repo: '/r$(x)', slots: 1 }] })
  );
  assert.throws(() => resolveHosts({ only: ['nope'] }), /Unknown fleet host/u);
});

test('the local host never receives a building shard', () => {
  const local = LOCAL_HOST;
  assert.equal(local.builds, false);
  for (const shard of defaultShards().filter((shard) => shard.builds))
    assert.equal(canRun(local, shard), false, shard.id);
  assert.deepEqual(
    unplaceable([local], defaultShards())
      .map((shard) => shard.id)
      .sort(),
    defaultShards()
      .filter((shard) => shard.builds)
      .map((shard) => shard.id)
      .sort()
  );
});

test('shards pull heaviest first and every shard is placed once', () => {
  const hosts = [
    { id: 'big', slots: 3, builds: true, capabilities: ['redis'] },
    { id: 'small', slots: 1, builds: false },
  ];
  const shards = defaultShards();
  const plan = simulate(hosts, shards);
  assert.equal(plan.unplaced.length, 0);
  assert.deepEqual(
    plan.placed.map((item) => item.shard).sort(),
    shards.map((shard) => shard.id).sort()
  );
  const pending = [...shards];
  assert.equal(takeShard(hosts[0], pending).id, 'type-check');
  assert.equal(takeShard(hosts[1], pending).builds, false);
});

test('shard catalog covers the CI check set and setups exist', () => {
  const ids = defaultShards().map((shard) => shard.id);
  for (const id of [
    'type-check',
    'unit-0',
    'unit-3',
    'root-scripts-2',
    'oxlint',
    'oxfmt',
    'i18n',
    'docs-seo',
    'codex-plugin',
  ])
    assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  for (const shard of defaultShards())
    if (shard.setup) assert.ok(SETUPS[shard.setup], shard.id);
  assert.match(rootScriptCommand(1, 3), /--test-shard=2\/3/u);
  assert.match(rootScriptCommand(0, 3), /node_modules" node -e/u);
  assert.deepEqual(
    selectShards(defaultShards(), ['root-scripts-*']).map((shard) => shard.id),
    ['root-scripts-0', 'root-scripts-1', 'root-scripts-2']
  );
  assert.throws(() => selectShards(defaultShards(), ['missing']));
});

test('host scripts only clean fleet worktrees and arguments are quoted', async () => {
  assert.match(SCRIPTS.cleanup, /fleet-ci-\*\) ;;/u);
  assert.equal(quote("a'b"), `'a'\\''b'`);
  const calls = [];
  const fake = (command, args) => {
    calls.push([command, args]);
    const { EventEmitter } = require('node:events');
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: (body) => calls.push(body) };
    setImmediate(() => child.emit('close', 0));
    return child;
  };
  const result = await runScript(
    { ssh: 'build-box' },
    'probe',
    ['/repo path'],
    {
      spawnImpl: fake,
    }
  );
  assert.equal(result.code, 0);
  assert.equal(calls[0][0], 'ssh');
  assert.ok(calls[0][1].includes("'/repo path'"));
  assert.equal(calls[1], SCRIPTS.probe);
  await assert.rejects(async () =>
    runScript({ ssh: null }, 'probe', ['bad\nvalue'], { spawnImpl: fake })
  );
});

test('argument parsing validates options', () => {
  assert.deepEqual(parseArgs(['--only', 'oxlint,i18n', '--plan']).only, [
    'oxlint',
    'i18n',
  ]);
  assert.throws(() => parseArgs(['--timeout', '0']));
  assert.throws(() => parseArgs(['--bogus']));
});

test('Redis-backed unit shards only run on hosts that can provide Redis', () => {
  const redisShards = defaultShards().filter((shard) =>
    shard.needs?.includes('redis')
  );
  assert.ok(redisShards.length >= 1);
  const plain = { id: 'plain', slots: 2, builds: true, capabilities: [] };
  const docker = { ...plain, id: 'docker', capabilities: ['redis'] };
  for (const shard of redisShards) {
    assert.equal(canRun(plain, shard), false, shard.id);
    assert.equal(canRun(docker, shard), true, shard.id);
  }
});

test('cleanup stops leftover shard processes before removing the worktree', () => {
  assert.ok(
    SCRIPTS.cleanup.indexOf('pkill -f') <
      SCRIPTS.cleanup.indexOf('git worktree remove')
  );
  assert.match(SCRIPTS.list, /fleet-ci-/u);
});

test('machine hosts load from a local file and keep the local host', () => {
  const remote = { id: 'box', ssh: 'box', repo: '/r', slots: 2, builds: true };
  const fsImpl = {
    existsSync: (file) => file === '/hosts.json',
    readFileSync: () => JSON.stringify([remote]),
  };
  assert.deepEqual(loadHostConfig('/hosts.json', fsImpl), [remote, LOCAL_HOST]);
  assert.deepEqual(loadHostConfig('/missing.json', fsImpl), DEFAULT_HOSTS);
  assert.throws(() =>
    loadHostConfig('/hosts.json', { ...fsImpl, readFileSync: () => '{}' })
  );
});

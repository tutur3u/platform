import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CliEnvironmentFailure,
  createSyntheticCliContext,
  hostedDockerEndpoint,
} from './cli-environment.mjs';
import { runHostedCommand } from './hosted-command.mjs';
import { CliProbeFailure, verificationFailureStatus } from './native-cli.mjs';
import {
  firewallRules,
  networkPolicy,
  verifyNetworkPolicy,
} from './network-policy.mjs';
import { command, runHostedHelper } from './proposal.mjs';

async function fixture(t) {
  const base = await mkdtemp(
    path.join(os.tmpdir(), 'hosted-command-contract-')
  );
  t.after(() => rm(base, { recursive: true, force: true }));
  const context = createSyntheticCliContext({
    root: path.join(base, 'private'),
    nativeBinary: process.execPath,
  });
  return { base, context };
}
const conflicts = {
  DOCKER_HOST: 'tcp://synthetic-unrelated.invalid:2375',
  DOCKER_CONTEXT: 'synthetic-other-daemon',
  DOCKER_CONFIG: '/synthetic/ambient-docker',
  HOME: '/synthetic/ambient-home',
  SUPABASE_ACCESS_TOKEN: 'synthetic-excluded',
  HTTP_PROXY: 'http://synthetic-proxy.invalid',
};
for (const args of [
  ['ps', '-a', '--format', '{{.Names}}'],
  ['volume', 'ls', '--format', '{{.Name}}'],
  ['network', 'ls', '--format', '{{.Name}}'],
  ['inspect', 'supabase_db_tt-synthetic'],
]) {
  test(`actual proposal Docker command excludes conflicts for ${args[0]}`, async (t) => {
    const { context } = await fixture(t);
    const previous = Object.fromEntries(
      Object.keys(conflicts).map((key) => [key, process.env[key]])
    );
    try {
      Object.assign(process.env, conflicts);
      let calls = 0;
      const output = await command('docker', args, 5000, 4 * 1024 ** 2, {
        nativeBinary: process.execPath,
        context: () => context,
        execute: (binary, argv, options) => {
          calls++;
          assert.equal(binary, 'docker');
          assert.deepEqual(argv, [
            '--host',
            hostedDockerEndpoint,
            '--config',
            context.env.DOCKER_CONFIG,
            ...args,
          ]);
          assert.equal(options.env, context.env);
          assert.equal(options.env.DOCKER_HOST, hostedDockerEndpoint);
          assert.equal(options.cwd, context.cwd);
          for (const key of [
            'DOCKER_CONTEXT',
            'SUPABASE_ACCESS_TOKEN',
            'HTTP_PROXY',
          ])
            assert(!Object.hasOwn(options.env, key));
          assert.equal(options.timeout, 5000);
          return 'synthetic-result\n';
        },
      });
      assert.equal(calls, 1);
      assert.equal(output, 'synthetic-result');
      for (const mode of ['--resume', '--cleanup']) {
        await runHostedHelper(
          process.execPath,
          ['/synthetic/helper', mode, context.cwd],
          { timeoutMs: 1000 },
          {
            nativeBinary: process.execPath,
            context: () => context,
            runner: async (_binary, _args, options) => {
              assert.equal(options.env.DOCKER_HOST, context.env.DOCKER_HOST);
              assert.equal(
                options.env.DOCKER_CONFIG,
                context.env.DOCKER_CONFIG
              );
            },
          }
        );
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
test('non-Docker policy subprocesses also receive only admitted environment', async (t) => {
  const { context } = await fixture(t);
  let called = false;
  await command('sudo', ['-n', 'synthetic-policy'], 5000, 1024 ** 2, {
    nativeBinary: process.execPath,
    context: () => context,
    execute: (binary, argv, options) => {
      called = true;
      assert.equal(binary, 'sudo');
      assert.deepEqual(argv, ['-n', 'synthetic-policy']);
      assert.equal(options.env, context.env);
      assert.equal(options.maxBuffer, 1024 ** 2);
      return '';
    },
  });
  assert(called);
});
test('actual fake Node command observes private environment instead of inherited values', async (t) => {
  const { context } = await fixture(t);
  const result = await runHostedCommand(
    process.execPath,
    [
      '-e',
      'console.log(JSON.stringify({cwd:process.cwd(),home:process.env.HOME,host:process.env.DOCKER_HOST,context:process.env.DOCKER_CONTEXT??null,token:process.env.SUPABASE_ACCESS_TOKEN??null}))',
    ],
    { context }
  );
  assert.deepEqual(JSON.parse(result), {
    cwd: context.cwd,
    home: context.env.HOME,
    host: hostedDockerEndpoint,
    context: null,
    token: null,
  });
});
test('dirty Docker config and directory replacement fail before any inventory command', async (t) => {
  const { base, context } = await fixture(t);
  await writeFile(
    path.join(context.env.DOCKER_CONFIG, 'config.json'),
    '{"currentContext":"synthetic-other"}'
  );
  const execute = () => assert.fail('must reject before command execution');
  assert.throws(
    () => runHostedCommand('docker', ['ps'], { context, execute }),
    CliEnvironmentFailure
  );
  await rm(path.join(context.env.DOCKER_CONFIG, 'config.json'));
  await rename(context.env.DOCKER_CONFIG, path.join(base, 'original'));
  await mkdir(context.env.DOCKER_CONFIG, { mode: 0o700 });
  assert.throws(
    () => runHostedCommand('docker', ['ps'], { context, execute }),
    CliEnvironmentFailure
  );
});

test('actual policy verifier routes every read through the admitted proposal command', async (t) => {
  assert.throws(() => verifyNetworkPolicy(), /Explicit policy runner required/);
  const { context } = await fixture(t);
  const observed = [];
  const result = await verifyNetworkPolicy((args) =>
    command('sudo', ['-n', ...args], 5000, 1024 ** 2, {
      nativeBinary: process.execPath,
      context: () => context,
      execute: (binary, argv, options) => {
        assert.equal(binary, 'sudo');
        assert.equal(options.env, context.env);
        observed.push(argv);
        const actual = argv.slice(1);
        if (actual[0] === 'cat')
          return JSON.stringify({
            'cgroup-parent': networkPolicy.slice,
            'default-address-pools': [
              { base: networkPolicy.containerPool, size: 24 },
            ],
            dns: networkPolicy.dns,
            ipv6: false,
          });
        if (actual[0] === 'bpftool')
          return JSON.stringify([
            { id: 1, attach_type: 'ingress' },
            { id: 2, attach_type: 'egress' },
          ]);
        if (actual[0] === 'systemctl')
          return actual.includes('IPAddressAllow')
            ? '127.0.0.0/8 172.28.0.0/16 ::1/128'
            : '0.0.0.0/0 ::/0';
        if (actual[2] === 'TTR-TYPEGEN-EGRESS') return firewallRules.join('\n');
        return `-A ${actual[2]} -j TTR-TYPEGEN-EGRESS`;
      },
    })
  );
  assert.equal(observed.length, 10);
  assert.deepEqual(result.programIds, [1, 2]);
});

for (const [binary, args, phase] of [
  ['docker', ['ps'], 'docker-command'],
  ['git', ['rev-parse', 'HEAD'], 'git-command'],
  ['sudo', ['-n', 'bpftool'], 'policy-kernel'],
  ['sudo', ['-n', 'iptables'], 'policy-firewall'],
]) {
  test(`failed ${binary} command exposes only its fixed phase`, async (t) => {
    const { context } = await fixture(t);
    await assert.rejects(
      command(binary, args, 5000, 1024, {
        context: () => context,
        execute: () => Promise.reject(new CliProbeFailure('command', 'failed')),
      }),
      (error) =>
        verificationFailureStatus('prepare', error) ===
        `Programming verification phase=${phase} outcome=failed`
    );
  });
}

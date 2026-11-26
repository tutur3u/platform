/// <reference types="vitest/globals" />
import { constants } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalizeJson,
  changePacketDigestsMatch,
  computeChangePacketDigest,
  createChangePacket,
  verifyChangePacket,
} from './change-packet';
import { createInfraClient } from './client';
import { runInfraCommand, type RunInfraCommandDeps } from './index';

const TIMESTAMP = '2026-11-27T00:00:00.000Z';
const ZONE_ID = '0123456789abcdef0123456789abcdef';
const CF_TOKEN = 'fixture-cloudflare-read';
const ADMIN_TOKEN = 'fixture-tuturuuu-read';
const ENV = {
  TTR_INFRA_CF_ACCOUNT_ID: 'fedcba9876543210fedcba9876543210',
  TTR_INFRA_CF_RO_TOKEN_STAGING: CF_TOKEN,
  TTR_INFRA_TOKEN_STAGING: ADMIN_TOKEN,
};

const body = {
  action: 'promote',
  changes: [{ before: { z: 1, a: [3, 2] }, after: 'version-2' }],
  createdAt: TIMESTAMP,
  env: 'staging',
  provider: 'cloudflare',
  reason: 'Accept reviewed version',
  rollbackPlan: 'Restore version-1',
  summary: 'Promote version-2',
  target: 'calendar-worker',
  version: 1,
} satisfies Parameters<typeof createChangePacket>[0] & { version: 1 };
const createArgs = [
  'packet',
  'create',
  '--provider=cloudflare',
  '--target=calendar-worker',
  '--action=promote',
  '--summary=Promote version-2',
  '--rollback=Restore version-1',
];

async function command(argv: string[], deps: RunInfraCommandDeps = {}) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  await runInfraCommand(argv, {
    envVars: {},
    readConfig: async () => ({}),
    now: () => new Date(TIMESTAMP),
    isTTY: true,
    ...deps,
    setExitCode(code) {
      exitCode = code;
    },
    write(chunk) {
      stdout += chunk;
      deps.write?.(chunk);
    },
    writeErr(chunk) {
      stderr += chunk;
    },
  });
  return { stdout, stderr, exitCode };
}

describe('Exact-ACK change packets', () => {
  it('sorts keys recursively using JSON string and number encoding', () => {
    const expected =
      '{"10":"ten","2":"two","a":[{"A":1,"z":0},"𝄞",true,null],"b":4}';
    const a = [{ z: -0, A: 1 }, '𝄞', true, null];
    const first = { b: 4, 2: 'two', a, 10: 'ten' };
    const second = {
      10: 'ten',
      a: [{ A: 1, z: 0 }, ...a.slice(1)],
      2: 'two',
      b: 4,
    };
    expect(canonicalizeJson(first)).toBe(expected);
    expect(canonicalizeJson(second)).toBe(expected);
    expect(() => canonicalizeJson({ value: Infinity })).toThrow();
    expect(() => canonicalizeJson({ value: '\ud800' })).toThrow();
  });

  it('hashes the canonical body and rejects changes to any digest-bound field', () => {
    const expected =
      'sha256:e971fa30d09477990cda5613ae68cf99473cd13cf5cffca0f8644717e6d48057';
    const packet = createChangePacket(body, []);
    expect(packet.digest).toBe(expected);
    expect(computeChangePacketDigest(body)).toBe(expected);
    expect(verifyChangePacket(packet, [])).toEqual(packet);
    expect(changePacketDigestsMatch(packet.digest, expected)).toBe(true);
    expect(changePacketDigestsMatch(expected, `sha256:${'f'.repeat(64)}`)).toBe(
      false
    );
    expect(changePacketDigestsMatch(expected, 'sha256:bad')).toBe(false);
    expect(() => verifyChangePacket({ ...packet, env: 'prod' }, [])).toThrow(
      /digest does not match/u
    );
    expect(() =>
      verifyChangePacket({ ...packet, changes: [{ after: 'tampered' }] }, [])
    ).toThrow(/digest does not match/u);
    expect(() => verifyChangePacket({ ...packet, version: 2 }, [])).toThrow();
  });

  describe('packet CLI files', () => {
    let root = '';
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'ttr-infra-packet-'));
    });
    afterEach(async () => {
      if (root) await rm(root, { recursive: true, force: true });
    });

    it('previews by default and gives --dry-run precedence over --yes', async () => {
      let networkCalls = 0;
      const fetch: typeof globalThis.fetch = async () => {
        networkCalls += 1;
        throw new Error('Unexpected network call');
      };
      const path = join(root, 'missing', 'change.json');
      for (const flag of ['', '--dry-run', '--dry-run=true']) {
        const flags = flag ? ['--yes', flag] : [];
        const preview = await command(
          [...createArgs, '--out', path, '--json', ...flags],
          { fetch }
        );
        expect(preview).toMatchObject({ exitCode: 0, stderr: '' });
        expect(JSON.parse(preview.stdout)).toMatchObject({
          version: 1,
          env: 'staging',
          createdAt: TIMESTAMP,
        });
      }
      expect(await readdir(root)).toEqual([]);
      expect(networkCalls).toBe(0);
    });

    it('writes canonical JSON atomically with mode 0600 and round-trips verify and show', async () => {
      const output = join(root, 'packet.json');
      const initialHandle = await open(
        output,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_TRUNC |
          constants.O_NOFOLLOW,
        0o644
      );
      let originalIno: number;
      try {
        await initialHandle.writeFile('old data');
        originalIno = (await initialHandle.stat()).ino;
      } finally {
        await initialHandle.close();
      }
      const created = await command([
        ...createArgs,
        `--out=${output}`,
        '--yes',
        '--json',
        '--reason=Reviewed release',
        '--changes=[{"field":"version","after":2}]',
      ]);
      expect(created).toMatchObject({ exitCode: 0, stderr: '' });
      const writtenHandle = await open(
        output,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      try {
        const info = await writtenHandle.stat();
        expect(await writtenHandle.readFile('utf8')).toBe(created.stdout);
        expect(info.mode & 0o7777).toBe(0o600);
        expect(info.ino).not.toBe(originalIno);
      } finally {
        await writtenHandle.close();
      }
      expect(await readdir(root)).toEqual(['packet.json']);
      const packet = verifyChangePacket(JSON.parse(created.stdout), []);
      expect(packet).toMatchObject({
        changes: [{ field: 'version', after: 2 }],
        reason: 'Reviewed release',
      });

      const shown = await command([
        'packet',
        'show',
        '--file',
        output,
        '--json',
      ]);
      expect(shown.stdout).toBe(created.stdout);
      const verifyArgs = ['packet', 'verify', `--file=${output}`];
      const expected = '--expected-digest=';
      const verified = await command([
        ...verifyArgs,
        expected + packet.digest,
        '--json',
      ]);
      expect(JSON.parse(verified.stdout)).toEqual({
        ok: true,
        digest: packet.digest,
      });
      const mismatch = await command([
        ...verifyArgs,
        `${expected}sha256:${'0'.repeat(64)}`,
      ]);
      expect(mismatch).toMatchObject({ stdout: '', exitCode: 2 });
    });

    it('refuses parent and leaf symlinks, traversal, and non-private output directories', async () => {
      const outside = join(root, 'external');
      const privateDir = join(root, 'private');
      await mkdir(outside, { mode: 0o700 });
      await mkdir(privateDir, { mode: 0o700 });
      const outsideFile = join(outside, 'packet.json');
      await writeFile(outsideFile, 'untouched', { mode: 0o600 });
      await symlink(outside, join(root, 'parent-link'));
      await symlink(outsideFile, join(privateDir, 'leaf-link'));
      const permissive = join(root, 'shared');
      await mkdir(permissive);
      await chmod(permissive, 0o755);

      for (const path of [
        join(root, 'parent-link', 'packet.json'),
        join(privateDir, 'leaf-link'),
        `${privateDir}/../external/packet.json`,
        join(permissive, 'packet.json'),
      ]) {
        const result = await command([...createArgs, '--out', path, '--yes']);
        expect(result).toMatchObject({ stdout: '', exitCode: 6 });
        expect(result.stderr).toContain('UNSAFE_PACKET_PATH');
      }
      expect(await readFile(outsideFile, 'utf8')).toBe('untouched');
      const read = await command([
        'packet',
        'show',
        '--file',
        join(privateDir, 'leaf-link'),
      ]);
      expect(read).toMatchObject({ stdout: '', exitCode: 6 });
    });

    it('refuses inferred production in previews and writes', async () => {
      const out = join(root, 'prod.json');
      for (const deps of [
        { envVars: { TTR_ENV: 'prod' } },
        { readConfig: async () => ({ defaultEnv: 'prod' as const }) },
      ]) {
        expect(
          await command([...createArgs, '--out', out], deps)
        ).toMatchObject({ stdout: '', exitCode: 6 });
        expect(
          await command([...createArgs, '--out', out, '--yes'], deps)
        ).toMatchObject({ stdout: '', exitCode: 6 });
      }
      expect(await readdir(root)).toEqual([]);
      const result = await command([
        '--env',
        'prod',
        ...createArgs,
        '--out',
        out,
        '--yes',
        '--json',
      ]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).env).toBe('prod');
    });

    it('screens packet fields and paths before writing output', async () => {
      const out = join(root, 'packet.json');
      for (const flags of [
        ['--reason', ADMIN_TOKEN],
        ['--reason', 'Bearer opaque-fixture'],
        ['--changes', '[{"password":"opaque-fixture"}]'],
      ]) {
        const result = await command(
          [...createArgs, ...flags, '--out', out, '--yes', '--json'],
          { envVars: ENV }
        );
        expect(result).toMatchObject({ stdout: '', exitCode: 6 });
        expect(result.stderr).toContain('CREDENTIAL_LEAK_BLOCKED');
      }
      expect(await readdir(root)).toEqual([]);
    });
  });
});

function apiFixture() {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname === '/client/v4/zones') {
      const page = url.searchParams.get('page');
      return Response.json({
        success: true,
        result:
          page === '1'
            ? [{ id: ZONE_ID, name: 'example.net', status: 'active' }]
            : [{ id: 'second-id', name: 'two.example.net', status: 'active' }],
        result_info: { total_pages: 2 },
      });
    }
    if (url.pathname.endsWith('/workers/scripts')) {
      return Response.json({
        success: true,
        result: [{ id: 'calendar-worker', modified_on: TIMESTAMP }],
      });
    }
    if (url.pathname.endsWith('/dns_records')) {
      return Response.json({
        success: true,
        result: [
          { name: 'example.net', type: 'MX', content: 'mail.example.net' },
        ],
      });
    }
    if (url.pathname.endsWith('/deployments/calendar-worker')) {
      return Response.json({
        configured: true,
        project: { id: 'calendar-worker' },
        environments: {
          staging: {
            ok: true,
            state: {
              lanes: [
                {
                  deployments: [
                    {
                      id: 'd1',
                      lane: 'edge',
                      status: 'succeeded',
                      sha: 'abcd',
                    },
                  ],
                },
              ],
            },
          },
          production: {
            ok: true,
            state: { lanes: [{ deployments: [{ id: 'wrong-env' }] }] },
          },
        },
      });
    }
    if (url.pathname.endsWith('/deployments')) {
      return Response.json({
        configured: true,
        projects: [{ id: 'calendar-worker', provider: 'cloudflare' }],
      });
    }
    if (url.pathname.endsWith('/devboxes')) {
      return Response.json({
        runners: [
          {
            id: 'runner-1',
            name: 'Studio',
            last_heartbeat_at: TIMESTAMP,
            status: 'active',
          },
        ],
        runs: [{ command: ['unknown-private-command'] }],
      });
    }
    throw new Error('Unexpected fixture request');
  };
  return { fetch, requests };
}

describe('infrastructure reads', () => {
  it.each([
    ['cloudflare zones', 'example.net'],
    ['cloudflare overview', 'active'],
    ['workers list', 'calendar-worker'],
    ['workers get calendar-worker', 'calendar-worker'],
    ['deploys list', 'calendar-worker'],
    ['deploys list --worker calendar-worker', 'succeeded'],
    [`dns-readonly list --zone ${ZONE_ID} --type MX`, 'mail.example.net'],
    ['runners list', 'Studio'],
    ['runners status', 'Studio'],
    ['hosts list', 'Studio'],
    ['hosts status', 'Studio'],
  ])('renders table and JSON for %s', async (input, marker) => {
    const argv = input.split(' ');
    const { fetch, requests } = apiFixture();
    const opts = { envVars: ENV, fetch };
    const table = await command([...argv, '--no-color'], opts);
    expect(table).toMatchObject({ exitCode: 0, stderr: '' });
    expect(table.stdout).toContain(marker);
    expect(table.stdout).toContain('│');

    const result = await command(['--json', ...argv], opts);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toEqual(expect.any(Array));
    expect(result.stdout).toContain(marker);
    expect(result.stdout).not.toContain('unknown-private-command');
    expect(result.stdout).not.toContain('wrong-env');
    expect(requests.length).toBeGreaterThan(0);
    for (const { url, init } of requests) {
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(init?.headers);
      expect(headers.get('x-ttr-env')).toBe('staging');
      expect(headers.get('x-ttr-request-id')).toBeTruthy();
      expect(headers.get('x-ttr-command')).toContain('infra');
      const cloudflare = url.hostname === 'api.cloudflare.com';
      expect(url.origin).toBe(
        cloudflare ? 'https://api.cloudflare.com' : 'https://infra.tutur3u.com'
      );
      expect(headers.get('authorization')).toBe(
        `Bearer ${cloudflare ? CF_TOKEN : ADMIN_TOKEN}`
      );
      if (url.pathname.endsWith('/dns_records'))
        expect(url.searchParams.get('type')).toBe('MX');
    }
  });

  it('refuses mutation commands and invalid DNS identifiers before fetch', async () => {
    const { fetch, requests } = apiFixture();
    for (const args of [
      ['workers', 'delete', 'calendar-worker', '--yes'],
      ['dns-readonly', 'list', '--zone', '../../accounts'],
      ['runners', 'drain', '--yes'],
      ['hosts', 'list', '--method', 'POST'],
    ]) {
      expect(await command(args, { envVars: ENV, fetch })).toMatchObject({
        stdout: '',
        exitCode: 1,
      });
    }
    expect(requests).toHaveLength(0);
  });

  it('keeps credentials scoped to their realm and explicit environment', async () => {
    const { fetch, requests } = apiFixture();
    const credentialStore = {
      get: async () => ({
        env: 'staging' as const,
        family: 'infra' as const,
        backend: 'env' as const,
        secret: ADMIN_TOKEN,
        profile: 'default',
        scopes: [],
        updatedAt: TIMESTAMP,
      }),
    };
    const staging = createInfraClient({
      env: 'staging',
      envVars: ENV,
      credentialStore,
      fetch,
    });
    const sandbox = createInfraClient({
      env: 'sandbox',
      envVars: ENV,
      credentialStore,
      fetch,
    });
    const error = { code: 'INFRA_CREDENTIAL_REQUIRED' };
    await expect(staging.listCloudflareZones()).rejects.toMatchObject(error);
    await expect(sandbox.listRunners()).rejects.toMatchObject(error);
    expect(requests).toHaveLength(0);
  });

  it.each([
    new Response(`not-json ${ADMIN_TOKEN}`, { status: 502 }),
    new Response('{"runners":[],"error":"fixture-tuturuuu-\\u0072ead"}'),
    new Response('{"runners":[],"error":"Bearer opaque-fixture"}'),
    new Response('{"runners":[]}', {
      headers: { 'X-Echo': 'fixture-tuturuuu-%72ead' },
    }),
    new Response('{"runners":[]}', {
      headers: { 'Set-Cookie': 'session=opaque-fixture' },
    }),
  ])(
    'blocks credential exposure in every response channel',
    async (response) => {
      const result = await command(['runners', 'list', '--json'], {
        envVars: ENV,
        fetch: async () => response,
      });
      expect(result).toMatchObject({ stdout: '', exitCode: 6 });
      expect(JSON.parse(result.stderr)).toMatchObject({
        error: { code: 'CREDENTIAL_LEAK_BLOCKED' },
      });
      expect(result.stderr).not.toContain(ADMIN_TOKEN);
      expect(result.stderr).not.toContain('opaque-fixture');
    }
  );

  it('refuses secret flags and does not forward raw network errors', async () => {
    const opts = {
      envVars: ENV,
      fetch: async () => {
        throw new Error(ADMIN_TOKEN);
      },
    };
    for (const flag of ['--accessToken', '--authorization', '--password']) {
      const result = await command(
        ['--json', 'hosts', 'list', `${flag}=${ADMIN_TOKEN}`],
        opts
      );
      expect(result).toMatchObject({ stdout: '', exitCode: 6 });
      expect(result.stderr).toContain('SECRET_IN_CLI_FLAG');
      expect(result.stderr).not.toContain(ADMIN_TOKEN);
    }
    const networkError = await command(['hosts', 'list'], opts);
    expect(networkError).toMatchObject({ stdout: '', exitCode: 5 });
    expect(networkError.stderr).not.toContain(ADMIN_TOKEN);
  });

  it.each([
    ['deploys', 'list'],
    ['runners', 'status'],
  ])(
    'streams one safe JSON object per watch tick for %s %s',
    async (family, action) => {
      const { fetch, requests } = apiFixture();
      const abort = new AbortController();
      const result = await command(
        [family, action, '--watch', '10', '--json'],
        {
          fetch,
          envVars: ENV,
          signal: abort.signal,
          write: () => abort.abort(),
        }
      );
      expect(result).toMatchObject({ exitCode: 0, stderr: '' });
      expect(requests).toHaveLength(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        attempt: 1,
        data: [expect.any(Object)],
      });
    }
  );

  it('terminates a watch immediately when the credential fence rejects a response', async () => {
    let calls = 0;
    const result = await command(
      ['runners', 'status', '--watch', '10', '--json'],
      {
        envVars: ENV,
        fetch: async () => {
          calls += 1;
          return new Response(ADMIN_TOKEN);
        },
      }
    );
    expect(result).toMatchObject({ stdout: '', exitCode: 6 });
    expect(calls).toBe(1);
  });
});

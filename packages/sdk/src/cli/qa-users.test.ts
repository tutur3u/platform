import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import { getHelpOutput } from './help';
import { parseQaTtl, runQaCommand, toStorageState } from './qa-users';
import {
  createQaSecretStore,
  type SecurityRunner,
  writePrivateFile,
} from './qa-users-secrets';

/** Mode and contents from one descriptor, so the checked file is the file read. */
async function readPrivate(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return {
      mode: (await handle.stat()).mode & 0o777,
      text: await handle.readFile('utf8'),
    };
  } finally {
    await handle.close();
  }
}

/** Mode of a directory, read through a descriptor opened on it. */
async function directoryMode(path: string) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    return (await handle.stat()).mode & 0o777;
  } finally {
    await handle.close();
  }
}

const RUN = 'abcd1234';
const USER = '11111111-2222-4333-8444-555555555555';
const EMAIL = `qa+${RUN}-1@tuturuuu.com`;
const PASSWORD = 'pw_SECRET_password_value_0123456789abcdef';
const ACCESS = 'access.SECRET.token';
const REFRESH = 'refresh-SECRET-token';
const COOKIE = 'cookie-SECRET-value';
const SECRETS = [PASSWORD, ACCESS, REFRESH, COOKIE];

const created = {
  runId: RUN,
  purpose: 'meet-rehearsal',
  expiresAt: '2026-11-21T13:00:00.000Z',
  runWorkspaceId: null,
  users: [
    {
      userId: USER,
      email: EMAIL,
      ordinal: 1,
      staff: true,
      tier: 'PRO',
      password: PASSWORD,
    },
  ],
  failed: [],
};
const minted = {
  userId: USER,
  email: EMAIL,
  runId: RUN,
  expiresAt: created.expiresAt,
  origin: 'https://tuturuuu.com',
  cookies: [
    {
      name: 'sb-auth',
      value: COOKIE,
      domain: '.tuturuuu.com',
      path: '/',
      sameSite: 'Lax',
      secure: true,
      httpOnly: false,
      maxAge: 3600,
    },
    {
      name: 'sb-auth.1',
      value: COOKIE,
      path: '/',
      sameSite: 'Lax',
      secure: true,
      httpOnly: false,
    },
  ],
  session: {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: 1_800_000_000,
  },
};
const listed = {
  users: [
    {
      userId: USER,
      email: EMAIL,
      runId: RUN,
      ordinal: 1,
      staff: true,
      tier: 'PRO',
      state: 'active',
      purpose: 'meet-rehearsal',
      operatorUserId: USER,
      expiresAt: created.expiresAt,
      runWorkspaceId: null,
      createdAt: created.expiresAt,
      deletedAt: null,
    },
  ],
};

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ttr-qa-'));
  process.env.TUTURUUU_QA_HOME = join(home, 'qa');
});
afterEach(() => {
  delete process.env.TUTURUUU_QA_HOME;
  process.exitCode = undefined;
});

function fixture(respond: (url: string, init?: RequestInit) => Response) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (input, init) => respond(String(input), init));
  const client = new TuturuuuUserClient({
    accessToken: 'cli-token',
    baseUrl: 'https://tuturuuu.com',
    fetch,
  });
  return { client, fetch };
}

function deps(runner?: SecurityRunner, keychain = false) {
  const out: string[] = [];
  return {
    out,
    deps: {
      secrets: createQaSecretStore(runner ?? (async () => ({ code: 0 }))),
      keychain,
      write: (text: string) => out.push(text),
      now: () => 1_700_000_000_000,
    },
  };
}

function expectNoSecrets(text: string) {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

describe('qa users', () => {
  it('parses TTLs within 15m..72h', () => {
    expect(parseQaTtl('24h')).toBe(86_400);
    expect(parseQaTtl('15m')).toBe(900);
    expect(parseQaTtl('3d')).toBe(259_200);
    expect(() => parseQaTtl('10m')).toThrow();
    expect(() => parseQaTtl('4d')).toThrow();
    expect(() => parseQaTtl('1w')).toThrow();
  });

  it('converts sessions to Playwright storage state', () => {
    const state = toStorageState(minted as never, 1_700_000_000_000);
    expect(state.origins).toEqual([]);
    expect(state.cookies[0]).toMatchObject({
      domain: '.tuturuuu.com',
      expires: 1_700_003_600,
    });
    expect(state.cookies[1]).toMatchObject({
      domain: 'tuturuuu.com',
      expires: -1,
    });
  });

  it('creates accounts, stores passwords in a 0600 file and never prints them', async () => {
    const { client, fetch } = fixture(() =>
      Response.json(created, { status: 201 })
    );
    const { out, deps: d } = deps();
    for (const json of [false, true]) {
      await runQaCommand(
        {
          client,
          json,
          positionals: ['users', 'create'],
          flags: {
            count: '1',
            tier: 'pro',
            staff: true,
            purpose: 'meet-rehearsal',
            ttl: '24h',
            'password-store': 'file',
          },
        },
        d
      );
    }
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({
      count: 1,
      tier: 'pro',
      staff: true,
      ttlSeconds: 86_400,
    });
    expectNoSecrets(out.join(''));
    const file = join(home, 'qa', RUN, 'credentials.json');
    const credentials = await readPrivate(file);
    expect(credentials.mode).toBe(0o600);
    expect(await directoryMode(join(home, 'qa', RUN))).toBe(0o700);
    expect(JSON.parse(credentials.text)).toEqual([
      { userId: USER, email: EMAIL, password: PASSWORD },
    ]);
  });

  it('passes keychain passwords only on stdin', async () => {
    const runner = vi.fn<SecurityRunner>(async () => ({ code: 0 }));
    const { client } = fixture(() => Response.json(created, { status: 201 }));
    const { out, deps: d } = deps(runner, true);
    await runQaCommand(
      {
        client,
        json: false,
        positionals: ['users', 'create'],
        flags: { count: '1', run: RUN },
      },
      d
    );
    const [args, stdin] = runner.mock.calls[0]!;
    expect(args).toEqual(['-i']);
    expect(args.join(' ')).not.toContain(PASSWORD);
    expect(stdin).toContain(`-a ${EMAIL}`);
    expect(stdin).toContain(`-w ${PASSWORD}`);
    expect(out.join('')).toContain('macOS Keychain');
    expectNoSecrets(out.join(''));
  });

  it('falls back to a file when the keychain write fails', async () => {
    const { client } = fixture(() => Response.json(created, { status: 201 }));
    const { deps: d } = deps(async () => ({ code: 1 }), true);
    await runQaCommand(
      {
        client,
        json: true,
        positionals: ['users', 'create'],
        flags: { count: '1', run: RUN },
      },
      d
    );
    expect(
      (await readPrivate(join(home, 'qa', RUN, 'credentials.json'))).mode
    ).toBe(0o600);
  });

  it('rejects mixing --run with new-run options before calling the API', async () => {
    const { client, fetch } = fixture(() => Response.json(created));
    const { deps: d } = deps();
    await expect(
      runQaCommand(
        {
          client,
          json: false,
          positionals: ['users', 'create'],
          flags: { run: RUN, ttl: '1h' },
        },
        d
      )
    ).rejects.toThrow();
    await expect(
      runQaCommand(
        {
          client,
          json: false,
          positionals: ['users', 'create'],
          flags: { count: '2' },
        },
        d
      )
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes sessions as 0600 storage state or tokens without printing them', async () => {
    const { client } = fixture(() => Response.json(minted, { status: 201 }));
    const { out, deps: d } = deps();
    await runQaCommand(
      {
        client,
        json: true,
        positionals: ['users', 'session', USER],
        flags: {},
      },
      d
    );
    await runQaCommand(
      {
        client,
        json: false,
        positionals: ['users', 'session', USER],
        flags: { format: 'tokens' },
      },
      d
    );
    expectNoSecrets(out.join(''));
    const state = join(home, 'qa', RUN, `${USER}.storage-state.json`);
    const tokens = join(home, 'qa', RUN, `${USER}.tokens.json`);
    const stateFile = await readPrivate(state);
    const tokensFile = await readPrivate(tokens);
    expect(stateFile.mode).toBe(0o600);
    expect(tokensFile.mode).toBe(0o600);
    expect(stateFile.text).toContain(COOKIE);
    expect(JSON.parse(tokensFile.text).refreshToken).toBe(REFRESH);
  });

  it('refuses to write credentials through a symlink', async () => {
    const target = join(home, 'elsewhere.json');
    await writeFile(target, '{}');
    const link = join(home, 'link.json');
    await symlink(target, link);
    await expect(writePrivateFile(link, 'secret')).rejects.toThrow(/non-file/);
    expect(await readFile(target, 'utf8')).toBe('{}');
    const { client } = fixture(() => Response.json(minted, { status: 201 }));
    const { deps: d } = deps();
    await expect(
      runQaCommand(
        {
          client,
          json: false,
          positionals: ['users', 'session', USER],
          flags: { out: link },
        },
        d
      )
    ).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('{}');
  });

  it('refuses a symlinked QA home', async () => {
    const real = join(home, 'real');
    await mkdir(real);
    await symlink(real, join(home, 'qa'));
    const { client } = fixture(() => Response.json(minted, { status: 201 }));
    const { deps: d } = deps();
    await expect(
      runQaCommand(
        {
          client,
          json: false,
          positionals: ['users', 'session', USER],
          flags: {},
        },
        d
      )
    ).rejects.toThrow(/real directory/);
  });

  it('cleanup removes local credentials and sessions of deleted users', async () => {
    const runner = vi.fn<SecurityRunner>(async () => ({ code: 0 }));
    const { deps: d } = deps(runner);
    await d.secrets.storePasswords(
      RUN,
      [{ userId: USER, email: EMAIL, password: PASSWORD }],
      'file'
    );
    await writePrivateFile(
      join(home, 'qa', RUN, `${USER}.storage-state.json`),
      '{}'
    );
    const { client } = fixture((url) =>
      url.includes('/cleanup')
        ? Response.json({
            fenced: false,
            deleted: [USER],
            pending: [],
            skipped: [],
          })
        : Response.json(listed)
    );
    await runQaCommand(
      {
        client,
        json: false,
        positionals: ['users', 'cleanup'],
        flags: { run: RUN },
      },
      d
    );
    await expect(
      lstat(join(home, 'qa', RUN, `${USER}.storage-state.json`))
    ).rejects.toThrow();
    await expect(
      lstat(join(home, 'qa', RUN, 'credentials.json'))
    ).rejects.toThrow();
    if (process.platform === 'darwin')
      expect(runner).toHaveBeenCalledWith([
        'delete-generic-password',
        '-s',
        'tuturuuu-qa',
        '-a',
        EMAIL,
      ]);
  });

  it('reports delete outcomes and requires exactly one cleanup target', async () => {
    const { client } = fixture((url, init) =>
      init?.method === 'DELETE'
        ? Response.json({ userId: USER, outcome: 'not_found' }, { status: 404 })
        : Response.json(listed)
    );
    const { out, deps: d } = deps();
    await runQaCommand(
      {
        client,
        json: false,
        positionals: ['users', 'delete', USER],
        flags: {},
      },
      d
    );
    expect(out.join('')).toContain('not_found');
    await expect(
      runQaCommand(
        { client, json: false, positionals: ['users', 'cleanup'], flags: {} },
        d
      )
    ).rejects.toThrow(/exactly one/);
  });

  it('serves scoped help without login', () => {
    expect(getHelpOutput('qa')).toContain('ttr qa users cleanup');
    expect(getHelpOutput('qa', 'users', 'session')).toContain(
      '--format storage-state|tokens'
    );
    expect(getHelpOutput('qa', 'users', 'session')).not.toContain(
      'cleanup (--run'
    );
  });
});

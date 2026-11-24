import { constants } from 'node:fs';
import { mkdir, mkdtemp, open, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import { EmployeesAdminClient } from '../platform-employees';
import {
  type EmployeesCliDeps,
  generateEmployeePassword,
  runEmployeesCommand,
} from './employees';
import {
  createEmployeeSecretStore,
  EMPLOYEE_PASSWORD,
  type KeychainReader,
} from './employees-secrets';
import type { SecurityRunner } from './qa-users-secrets';
import { getHelpOutput } from './help';

const EMAIL = 'qa-operator@tuturuuu.com';
const NAME = 'QA Operator';
const USER = '11111111-2222-4333-8444-555555555555';
const OP = '22222222-3333-4444-8555-666666666666';
const PASSWORD = 'Synthetic.SECRET-pass_value-0123';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ttr-employees-'));
  process.env.TUTURUUU_EMPLOYEES_HOME = join(home, 'employees');
  process.exitCode = undefined;
});
afterEach(() => {
  delete process.env.TUTURUUU_EMPLOYEES_HOME;
  process.exitCode = undefined;
});

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

const created = (operationId: string) => ({
  status: 'created',
  operationId,
  account: { id: USER, email: EMAIL, displayName: NAME },
});

/** `respond` answers POSTs; GETs (the availability probe) use `get`. */
function fixture(
  respond: (url: string, init?: RequestInit) => Response,
  get: () => Response = () => Response.json({ available: true })
) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (input, init) =>
      (init?.method ?? 'GET') === 'GET' ? get() : respond(String(input), init)
    );
  const posts = () =>
    fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
  const user = new TuturuuuUserClient({
    accessToken: 'cli-token',
    baseUrl: 'https://tuturuuu.com',
    fetch,
  });
  return {
    fetch,
    posts,
    client: () => new EmployeesAdminClient(user.getClientOptions()),
  };
}

function deps(
  options: {
    runner?: SecurityRunner;
    reader?: KeychainReader;
    keychain?: boolean;
  } = {}
) {
  const out: string[] = [];
  const keychain = options.keychain ?? false;
  const value: EmployeesCliDeps = {
    secrets: createEmployeeSecretStore({
      runner: options.runner ?? (async () => ({ code: 1 })),
      reader: options.reader ?? (async () => ({ code: 1, stdout: '' })),
      keychain,
    }),
    keychain,
    write: (text) => out.push(text),
    now: () => new Date('2026-11-24T05:00:00Z'),
    newOperationId: () => OP,
    newPassword: () => PASSWORD,
  };
  return { out, deps: value };
}

const createArgs = (extra: Record<string, string | boolean> = {}) => ({
  positionals: ['create', EMAIL],
  flags: { name: NAME, 'password-store': 'file', ...extra },
});

describe('ttr employees create', () => {
  it('generates strong passwords that satisfy the server policy', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateEmployeePassword();
      expect(password).toHaveLength(32);
      expect(password).toMatch(EMPLOYEE_PASSWORD);
      for (const pattern of [/[a-z]/, /[A-Z]/, /[0-9]/, /[!%+,.:=?@^_~-]/])
        expect(password).toMatch(pattern);
    }
  });

  it('refuses secrets and malformed addresses before any network or store access', async () => {
    const { fetch, client } = fixture(() => Response.json({}));
    const { deps: d } = deps();
    for (const flags of [
      { name: NAME, password: 'x' },
      { name: NAME, token: 'x' },
      { name: NAME, 'temporary-password': 'x' },
    ])
      await expect(
        runEmployeesCommand(
          { client, json: false, positionals: ['create', EMAIL], flags },
          d
        )
      ).rejects.toThrow(/never accepted/);
    for (const positionals of [
      ['create'],
      ['create', EMAIL, 'second@tuturuuu.com'],
      ['create', 'someone@gmail.com'],
      ['create', 'a@tuturuuu.com.evil.test'],
    ])
      await expect(
        runEmployeesCommand(
          { client, json: false, positionals, flags: { name: NAME } },
          d
        )
      ).rejects.toThrow();
    await expect(
      runEmployeesCommand(
        { client, json: false, positionals: ['create', EMAIL], flags: {} },
        d
      )
    ).rejects.toThrow(/--name/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(readdir(home)).resolves.toEqual([]);
  });

  it('stores the password 0600 before sending it only in the body, and never prints it', async () => {
    let storedBeforeSend = false;
    const { posts, client } = fixture(() =>
      Response.json(created(OP), { status: 201 })
    );
    const { out, deps: d } = deps();
    const original = d.secrets.storePassword;
    d.secrets.storePassword = async (...args) => {
      expect(posts()).toEqual([]);
      storedBeforeSend = true;
      return original(...args);
    };
    for (const json of [false, true])
      await runEmployeesCommand({ client, json, ...createArgs() }, d);
    expect(storedBeforeSend).toBe(true);
    expect(posts()).toHaveLength(1);
    const [url, init] = posts()[0]!;
    expect(String(url)).toBe(
      'https://tuturuuu.com/api/v1/infrastructure/internal-accounts/employees'
    );
    expect(String(url)).not.toContain(PASSWORD);
    const headers = new Headers(init!.headers);
    expect(headers.get('idempotency-key')).toBe(OP);
    expect(headers.get('x-tuturuuu-account-action')).toBe('1');
    expect(headers.get('authorization')).toBe('Bearer cli-token');
    expect([...headers.values()].join(' ')).not.toContain(PASSWORD);
    expect(JSON.parse(String(init!.body))).toEqual({
      email: EMAIL,
      displayName: NAME,
      temporaryPassword: PASSWORD,
    });
    const printed = out.join('');
    expect(printed).not.toContain(PASSWORD);
    expect(printed).toContain(USER);
    expect(printed).toContain('Created.');
    const summary = JSON.parse(out[1]!);
    expect(summary).toMatchObject({
      existing: true,
      email: EMAIL,
      userId: USER,
      status: 'created',
      mailbox: 'active',
      credential: { store: 'file' },
    });
    const credential = await readPrivate(
      join(home, 'employees', `${EMAIL}.credential.json`)
    );
    expect(credential.mode).toBe(0o600);
    expect(JSON.parse(credential.text)).toEqual({
      email: EMAIL,
      password: PASSWORD,
    });
    const state = await readPrivate(join(home, 'employees', `${EMAIL}.json`));
    expect(state.mode).toBe(0o600);
    expect(state.text).not.toContain(PASSWORD);
    const dir = await open(
      join(home, 'employees'),
      constants.O_RDONLY | constants.O_DIRECTORY
    );
    expect((await dir.stat()).mode & 0o777).toBe(0o700);
    await dir.close();
  });

  it('dry-run makes only a read-only GET, stores nothing and withholds the secret', async () => {
    const { fetch, client } = fixture(() => Response.json({ available: true }));
    const generate = vi.fn(() => PASSWORD);
    const { out, deps: d } = deps();
    d.newPassword = generate;
    await runEmployeesCommand(
      { client, json: true, ...createArgs({ 'dry-run': true }) },
      d
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]?.method ?? 'GET').toBe('GET');
    expect(generate).not.toHaveBeenCalled();
    await expect(readdir(home)).resolves.toEqual([]);
    const plan = JSON.parse(out.join(''));
    expect(plan).toMatchObject({
      dryRun: true,
      action: 'create',
      request: {
        method: 'POST',
        body: {
          email: EMAIL,
          displayName: NAME,
          temporaryPassword: '<generated locally; withheld>',
        },
      },
      preflight: { admitted: true, available: true },
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('dry-run reports a rejected admission probe and refuses a value-capturing --dry-run', async () => {
    const { client } = fixture(
      () => Response.json({}),
      () => Response.json({ code: 'unauthorized' }, { status: 401 })
    );
    const { out, deps: d } = deps();
    await runEmployeesCommand(
      { client, json: false, ...createArgs({ 'dry-run': true }) },
      d
    );
    expect(out.join('')).toContain('not admitted (401)');
    expect(process.exitCode).toBe(1);
    await expect(
      runEmployeesCommand(
        { client, json: false, ...createArgs({ 'dry-run': EMAIL }) },
        d
      )
    ).rejects.toThrow(/--dry-run/);
  });

  it('replays a pending operation with the same stored password and operation', async () => {
    let calls = 0;
    const bodies: unknown[] = [];
    const { client } = fixture((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      calls += 1;
      return calls === 1
        ? Response.json(
            {
              status: 'pending',
              operationId: OP,
              code: 'account_creation_outcome_unknown',
              nextAction: 'inspect',
            },
            { status: 202 }
          )
        : Response.json(created(OP), { status: 201 });
    });
    const first = deps();
    await runEmployeesCommand(
      { client, json: false, ...createArgs() },
      first.deps
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    const second = deps();
    const generate = vi.fn(() => 'Different-password-0123456789!');
    second.deps.newPassword = generate;
    second.deps.newOperationId = () => 'unused';
    await runEmployeesCommand(
      { client, json: false, ...createArgs() },
      second.deps
    );
    expect(generate).not.toHaveBeenCalled();
    expect(bodies[1]).toEqual(bodies[0]);
    expect(second.out.join('')).toContain('Created.');
    expect([...first.out, ...second.out].join('')).not.toContain(PASSWORD);
  });

  it('refuses to overwrite a stored credential that has no local operation', async () => {
    await mkdir(join(home, 'employees'), { mode: 0o700 });
    const { fetch, client } = fixture(() => Response.json({}));
    const { deps: d } = deps();
    await d.secrets.storePassword(EMAIL, PASSWORD, 'file');
    await expect(
      runEmployeesCommand({ client, json: false, ...createArgs() }, d)
    ).rejects.toThrow(/not overwriting/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(d.secrets.readPassword(EMAIL, 'file')).resolves.toBe(PASSWORD);
  });

  it('reports an existing account and discards only the password it just generated', async () => {
    const { client } = fixture(() =>
      Response.json(
        {
          status: 'conflict',
          operationId: OP,
          code: 'employee_account_conflict',
          nextAction: 'inspect',
        },
        { status: 409 }
      )
    );
    const { out, deps: d } = deps();
    await runEmployeesCommand({ client, json: true, ...createArgs() }, d);
    expect(JSON.parse(out.join(''))).toMatchObject({ status: 'exists' });
    expect(process.exitCode).toBe(1);
    await expect(readdir(join(home, 'employees'))).resolves.toEqual([]);
  });

  it('passes the keychain password only on stdin and never replaces an item', async () => {
    const runner = vi.fn<SecurityRunner>(async (args) => ({
      code: args[0] === 'find-generic-password' ? 44 : 0,
    }));
    const { client } = fixture(() =>
      Response.json(created(OP), { status: 201 })
    );
    const { out, deps: d } = deps({ runner, keychain: true });
    await runEmployeesCommand(
      {
        client,
        json: false,
        positionals: ['create', EMAIL],
        flags: { name: NAME },
      },
      d
    );
    const add = runner.mock.calls.find(([args]) => args[0] === '-i')!;
    expect(add[0]).toEqual(['-i']);
    expect(add[1]).toContain(`-s tuturuuu-employee -a ${EMAIL}`);
    expect(add[1]).toContain(`-w ${PASSWORD}`);
    expect(add[1]).not.toContain(' -U');
    for (const [args] of runner.mock.calls)
      expect(args.join(' ')).not.toContain(PASSWORD);
    expect(out.join('')).toContain('macOS Keychain');
    expect(out.join('')).not.toContain(PASSWORD);
  });

  it('refuses a symlinked credential directory', async () => {
    const real = join(home, 'real');
    await mkdir(real);
    await symlink(real, join(home, 'employees'));
    const { fetch, client } = fixture(() => Response.json({}));
    const { deps: d } = deps();
    await expect(
      runEmployeesCommand({ client, json: false, ...createArgs() }, d)
    ).rejects.toThrow(/real directory/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(readdir(real)).resolves.toEqual([]);
  });

  it('stores and sends nothing when the server is unavailable or refuses the session', async () => {
    for (const get of [
      () => Response.json({ available: false }),
      () => Response.json({ code: 'forbidden' }, { status: 403 }),
    ]) {
      const { posts, client } = fixture(() => Response.json({}), get);
      const generate = vi.fn(() => PASSWORD);
      const { deps: d } = deps();
      d.newPassword = generate;
      await expect(
        runEmployeesCommand({ client, json: false, ...createArgs() }, d)
      ).rejects.toThrow(/nothing was stored or sent/);
      expect(posts()).toEqual([]);
      expect(generate).not.toHaveBeenCalled();
    }
    await expect(readdir(home)).resolves.toEqual([]);
  });

  it('refuses a keychain duplicate instead of falling back, and releases its claim', async () => {
    const runner = vi.fn<SecurityRunner>(async (args) => ({
      code: args[0] === 'find-generic-password' ? 44 : 45,
    }));
    const { posts, client } = fixture(() => Response.json({}));
    const { deps: d } = deps({ runner, keychain: true });
    await expect(
      runEmployeesCommand(
        {
          client,
          json: false,
          positionals: ['create', EMAIL],
          flags: { name: NAME },
        },
        d
      )
    ).rejects.toThrow(/not overwriting/);
    expect(posts()).toEqual([]);
    await expect(readdir(join(home, 'employees'))).resolves.toEqual([]);
  });

  it('falls back to a 0600 file on other keychain failures', async () => {
    const runner = vi.fn<SecurityRunner>(async (args) => ({
      code: args[0] === 'find-generic-password' ? 44 : 1,
    }));
    const { client } = fixture(() =>
      Response.json(created(OP), { status: 201 })
    );
    const { out, deps: d } = deps({ runner, keychain: true });
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    await runEmployeesCommand(
      {
        client,
        json: true,
        positionals: ['create', EMAIL],
        flags: { name: NAME },
      },
      d
    );
    expect(String(stderr.mock.calls[0]?.[0])).toMatch(/keychain store failed/);
    stderr.mockRestore();
    expect(JSON.parse(out.join(''))).toMatchObject({
      credential: { store: 'file' },
    });
    expect(
      (await readPrivate(join(home, 'employees', `${EMAIL}.credential.json`)))
        .mode
    ).toBe(0o600);
  });

  it('refuses a second operation while a local one exists for the address', async () => {
    const { deps: d } = deps();
    await d.secrets.claimState({
      version: 1,
      email: EMAIL,
      displayName: NAME,
      operationId: OP,
      status: 'pending',
      userId: null,
      store: 'file',
      location: 'pending',
      updatedAt: '2026-11-24T05:00:00.000Z',
    });
    await expect(
      d.secrets.claimState({
        version: 1,
        email: EMAIL,
        displayName: NAME,
        operationId: USER,
        status: 'pending',
        userId: null,
        store: 'file',
        location: 'pending',
        updatedAt: '2026-11-24T05:00:00.000Z',
      })
    ).rejects.toThrow(/already exists or is in progress/);
    expect((await d.secrets.readState(EMAIL))?.operationId).toBe(OP);
  });

  it('refuses a --name that differs from the pending local operation', async () => {
    let calls = 0;
    const { posts, client } = fixture(() => {
      calls += 1;
      return Response.json(
        {
          status: 'pending',
          operationId: OP,
          code: 'account_creation_outcome_unknown',
          nextAction: 'inspect',
        },
        { status: 202 }
      );
    });
    await runEmployeesCommand(
      { client, json: false, ...createArgs() },
      deps().deps
    );
    await expect(
      runEmployeesCommand(
        { client, json: false, ...createArgs({ name: 'Someone Else' }) },
        deps().deps
      )
    ).rejects.toThrow(/rerun with that --name/);
    expect(posts()).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('discards a fresh attempt the server rejects as invalid input', async () => {
    const { client } = fixture(() =>
      Response.json(
        {
          status: 'not_admitted',
          code: 'employee_creation_not_admitted',
          reason: 'invalid_input',
          phase: 'before_claim',
          targetUserId: null,
          actorUserId: USER,
          operationId: OP,
          email: EMAIL,
          displayName: NAME,
        },
        { status: 400 }
      )
    );
    const { out, deps: d } = deps();
    await runEmployeesCommand({ client, json: true, ...createArgs() }, d);
    expect(JSON.parse(out.join(''))).toMatchObject({ status: 'rejected' });
    expect(process.exitCode).toBe(1);
    await expect(readdir(join(home, 'employees'))).resolves.toEqual([]);
  });

  it('keeps the pending state and password when the reply is unexpected', async () => {
    const { client } = fixture(() =>
      Response.json({ code: 'employee_creation_unavailable' }, { status: 500 })
    );
    const { deps: d } = deps();
    const error = await runEmployeesCommand(
      { client, json: false, ...createArgs() },
      d
    ).catch((caught: Error) => caught);
    expect(String(error)).toMatch(/not confirmed \(HTTP 500/);
    expect(String(error)).not.toContain(PASSWORD);
    expect(await d.secrets.readState(EMAIL)).toMatchObject({
      status: 'pending',
      operationId: OP,
    });
    await expect(d.secrets.readPassword(EMAIL, 'file')).resolves.toBe(PASSWORD);
  });

  it('serves help without login', () => {
    expect(getHelpOutput('employees')).toContain('ttr employees create');
    expect(getHelpOutput('workspaces', 'roles')).toContain(
      'ttr workspaces roles create'
    );
  });
});

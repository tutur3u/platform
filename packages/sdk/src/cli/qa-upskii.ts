import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { type ParsedArgs, getFlag } from './args';
import {
  ensurePrivateDirectory,
  qaHome,
  writePrivateFile,
} from './qa-users-secrets';

const app = 'https://app.upskii.com';
const provisioner = 'https://admin.upskii.com/api/admin/qa/users';
const passwordEndpoint = 'https://upskii.com/api/auth/password';
const sessionEndpoint =
  app + '/api/auth/get-session?disableCookieCache=true&disableRefresh=true';
const ttlSeconds = 7200;

const issuedIdentity = z.object({
  outcome: z.literal('created'),
  isTest: z.literal(true),
  createdByRequestId: z.uuid(),
  userId: z.uuid(),
  user: z.object({
    userId: z.uuid(),
    email: z.email(),
    role: z.enum(['teacher', 'student']),
    runLabel: z.string(),
    expiresAt: z.iso.datetime(),
    password: z.string().min(1),
  }),
});
const sessionIdentity = z.object({
  user: z.object({ id: z.uuid(), email: z.email() }),
});

async function readKeychainBearer() {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Upskii QA requires the provisioner entry in macOS Keychain.'
    );
  }
  try {
    const { stdout } = await promisify(execFile)(
      '/usr/bin/security',
      [
        'find-generic-password',
        '-s',
        'com.upskii.qa-provisioner.production',
        '-a',
        'fleet',
        '-w',
      ],
      { timeout: 10_000, maxBuffer: 8192 }
    );
    return stdout.trim();
  } catch {
    throw new Error(
      'Could not read the Upskii QA provisioner entry from Keychain.'
    );
  }
}

interface UpskiiQaDeps {
  fetch: typeof fetch;
  readBearer: () => Promise<string>;
  write: (text: string) => void;
  now: () => number;
}

async function request(fetcher: typeof fetch, url: string, init: RequestInit) {
  return fetcher(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
}

async function browserState(
  deps: UpskiiQaDeps,
  user: z.infer<typeof issuedIdentity>['user']
) {
  const response = await request(deps.fetch, passwordEndpoint, {
    method: 'POST',
    headers: { origin: app, 'sec-fetch-site': 'same-site' },
    body: new URLSearchParams({
      email: user.email,
      password: user.password,
      intent: user.role,
      returnTo: app + '/',
    }),
  });
  await response.body?.cancel();
  if (response.status !== 303) throw new Error('Upskii QA sign-in refused.');

  const cookies = response.headers.getSetCookie().flatMap((header) => {
    const [pair = '', ...attrs] = header.split(';').map((part) => part.trim());
    const match =
      /^(?<name>(?:__Secure-)?upskii\.session_token)=(?<value>[^\s;,]+)$/u.exec(
        pair
      );
    if (!match?.groups) return [];
    const options = attrs.map((attr) => attr.toLowerCase());
    const domain = options.find((attr) => attr.startsWith('domain='));
    const path = options.find((attr) => attr.startsWith('path='));
    if (
      !options.includes('secure') ||
      !options.includes('httponly') ||
      (domain !== 'domain=.upskii.com' && domain !== 'domain=upskii.com') ||
      path !== 'path=/'
    )
      return [];
    const expiry = Math.floor(Date.parse(user.expiresAt) / 1000);
    const now = Math.floor(deps.now() / 1000);
    const maxAge = options.find((attr) => attr.startsWith('max-age='));
    const expires = options.find((attr) => attr.startsWith('expires='));
    const cookieExpiry = maxAge
      ? now + Number(maxAge.slice('max-age='.length))
      : expires
        ? Math.floor(Date.parse(expires.slice('expires='.length)) / 1000)
        : expiry;
    if (!Number.isFinite(cookieExpiry) || Math.min(expiry, cookieExpiry) <= now)
      return [];
    const sameSite = options.includes('samesite=strict')
      ? 'Strict'
      : options.includes('samesite=none')
        ? 'None'
        : 'Lax';
    return [
      {
        name: match.groups.name,
        value: match.groups.value,
        domain: '.upskii.com',
        path: '/',
        expires: Math.min(expiry, cookieExpiry),
        secure: true,
        httpOnly: true,
        sameSite,
      },
    ];
  });
  const [cookie] = cookies;
  if (cookies.length !== 1 || !cookie)
    throw new Error('Upskii QA session cookie was not issued.');

  const readback = await request(deps.fetch, sessionEndpoint, {
    headers: {
      cookie: cookie.name + '=' + cookie.value,
      accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (readback.status !== 200) {
    await readback.body?.cancel();
    throw new Error('Upskii QA session verification failed.');
  }
  const parsed = sessionIdentity.safeParse(await readback.json());
  if (
    !parsed.success ||
    parsed.data.user.id !== user.userId ||
    parsed.data.user.email !== user.email
  ) {
    throw new Error('Upskii QA session identity mismatch.');
  }
  return { cookies, origins: [] };
}

export async function runUpskiiQaCommand(
  { flags, positionals }: ParsedArgs,
  deps: UpskiiQaDeps = {
    fetch,
    readBearer: readKeychainBearer,
    write: (line) => process.stdout.write(line),
    now: Date.now,
  }
) {
  const issue =
    positionals.length === 2 &&
    positionals[0] === 'account' &&
    positionals[1] === 'issue';
  const session = positionals.length === 1 && positionals[0] === 'session';
  if (!issue && !session)
    throw new Error('Upskii QA supports account issue and session.');
  const allowed = ['product', 'role', 'ttl', 'workspace', 'json'];
  if (session) allowed.push('out');
  for (const key of Object.keys(flags)) {
    if (!allowed.includes(key) || (key !== 'json' && !getFlag(flags, key))) {
      throw new Error('Unsupported or missing Upskii QA option value.');
    }
  }
  const role = getFlag(flags, 'role');
  if (role !== 'teacher' && role !== 'student')
    throw new Error('Upskii QA supports teacher and student roles.');
  if (
    (getFlag(flags, 'ttl') ?? '2h') !== '2h' ||
    (getFlag(flags, 'workspace') ?? 'qa') !== 'qa'
  ) {
    throw new Error('Upskii QA requires --ttl 2h and --workspace qa.');
  }
  const output = getFlag(flags, 'out');
  if (session && !output) throw new Error('Pass --out <storageState.json>.');
  if (output && !(await stat(dirname(resolve(output)))).isDirectory()) {
    throw new Error('Upskii QA output directory does not exist.');
  }
  const bearer = await deps.readBearer();
  if (!/^[!-~]+$/u.test(bearer))
    throw new Error('Upskii QA provisioner bearer is missing or malformed.');

  const requestId = randomUUID();
  const runLabel = 'ttr-' + requestId.replaceAll('-', '').slice(0, 24);
  const sentAt = deps.now();
  let userId = requestId;
  try {
    const response = await request(deps.fetch, provisioner, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + bearer,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requestId, runLabel, role, ttlSeconds }),
    });
    if (response.status !== 201) {
      await response.body?.cancel();
      throw new Error('Upskii QA provisioner refused the request.');
    }
    const parsed = issuedIdentity.safeParse(await response.json());
    if (!parsed.success)
      throw new Error('Invalid Upskii QA provisioner receipt.');
    const { user } = parsed.data;
    const expiry = Date.parse(user.expiresAt);
    if (
      parsed.data.createdByRequestId !== requestId ||
      parsed.data.userId !== requestId ||
      user.userId !== requestId ||
      user.email !== 'qa-fleet+' + runLabel + '-' + role + '@tuturuuu.com' ||
      user.runLabel !== runLabel ||
      user.role !== role ||
      expiry <= deps.now() ||
      expiry > sentAt + ttlSeconds * 1000 + 15_000
    )
      throw new Error('Upskii QA provisioner receipt scope mismatch.');

    userId = user.userId;
    const summary = {
      product: 'upskii',
      requestId,
      userId,
      email: user.email,
      role,
      expiresAt: user.expiresAt,
    };
    let path: string;
    if (session && output) {
      const state = await browserState(deps, user);
      path = await writePrivateFile(output, JSON.stringify(state) + '\n');
    } else {
      const home = qaHome();
      await ensurePrivateDirectory(home);
      const dir = await mkdtemp(join(home, 'upskii-'));
      path = await writePrivateFile(
        join(dir, 'credentials.json'),
        JSON.stringify({ ...summary, password: user.password }) + '\n'
      );
    }
    deps.write(JSON.stringify({ ...summary, path }) + '\n');
  } catch {
    throw new Error(
      'Upskii QA request did not complete. Reconcile request ' +
        requestId +
        ' and QA user ' +
        userId +
        ' before retrying.'
    );
  }
}

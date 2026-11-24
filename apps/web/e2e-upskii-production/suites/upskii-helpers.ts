import { randomUUID } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { type Actors, loadActors } from '../actors';
import { owners, requiredInput, run } from '../fixtures';
import { call, jsonInit } from '../http';
import { type Actor, Ledger, type ResourceRecord } from '../ledger';
import { HOSTS, on } from '../policy';
import {
  type UpskiiApp,
  type UpskiiIdentity,
  upskiiApp,
  upskiiProvisioner,
  upskiiSignIn,
} from '../upskii';

/**
 * Shared helpers for the learner, educator and admin suites. Routes and
 * statuses come from Upskii origin/main: on app.upskii.com the experience is
 * the session's selected role (teacher -> educator, student -> learn); a
 * family the role's experience does not own is a 404 at the app router, a
 * method it does not declare is a 405, and a signed-out API call is a 401.
 * Resource-level refusals inside a handler are `UserFacingError`s, which
 * `routeError` maps to 400.
 */

export type Track = (record: Omit<ResourceRecord, 'suite'>) => void;
export type Role = 'teacher' | 'student' | 'outsider';
export type Json = Record<string, unknown>;
type Cleanup = NonNullable<ResourceRecord['cleanup']>;
type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const ACTOR: Record<Role, Actor> = {
  teacher: 'teacher',
  student: 'learner',
  outsider: 'outsider',
};

/** Family absent from the caller's experience (app router). */
export const ABSENT = [404];
/** Path matches the caller's experience but not this method. */
export const WRONG_METHOD = [405];
export const ANONYMOUS = [401];
/** Service-level refusal (`UserFacingError` -> 400) or an explicit 403/404. */
export const REFUSED = [400, 403, 404];

export function upskiiActors(actors: Actors) {
  if (!actors.upskii) throw new Error('Upskii QA actors were not provisioned');
  return actors.upskii;
}

export async function getJson<T = Json>(
  api: UpskiiApp,
  label: string,
  path: string,
  expected = [200]
): Promise<T> {
  return (await api(label, path, { expect: expected })).json as T;
}

export async function sendJson<T = Json>(
  api: UpskiiApp,
  label: string,
  method: Method,
  path: string,
  body: unknown,
  expected = [200]
): Promise<T> {
  return (
    await api(label, path, { ...jsonInit(method, body), expect: expected })
  ).json as T;
}

/** Negative probe; throws HttpError (status only) when the status differs. */
export async function refused(
  api: UpskiiApp,
  label: string,
  method: 'GET' | Method,
  path: string,
  expected: number[],
  body: unknown = {}
) {
  const init = method === 'GET' ? {} : jsonInit(method, body);
  return (await api(label, path, { ...init, expect: expected })).status;
}

/** Dotted path to a non-empty string id in a response. */
export function field(value: unknown, path: string): string {
  let current: unknown = value;
  for (const key of path.split('.'))
    current = (current as Json | null | undefined)?.[key];
  if (typeof current !== 'string' || !current)
    throw new Error(`Response has no ${path}`);
  return current;
}

export function list<T = Json>(value: unknown, path: string): T[] {
  let current: unknown = value;
  for (const key of path.split('.'))
    current = (current as Json | null | undefined)?.[key];
  if (!Array.isArray(current)) throw new Error(`Response has no list ${path}`);
  return current as T[];
}

export function ledgerKey(what: string) {
  const slug = what
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .slice(0, 40);
  return `upskii-object:${run.runLabel}:${slug}:${randomUUID().slice(0, 8)}`;
}

/** Ledger writer for beforeAll/afterAll, where test fixtures are unavailable. */
export function suiteTrack(suite: string): Track {
  const ledger = new Ledger(run.ledgerPath);
  return (record) => {
    if (!record.coveredBy) throw new Error('Tracked objects need an owner');
    ledger.register({ ...record, suite });
  };
}

const cookies = new Map<string, Promise<string>>();
/** One password sign-in per identity per worker; the cookie is never logged. */
function sessionCookie(identity: UpskiiIdentity) {
  let cookie = cookies.get(identity.userId);
  if (!cookie) {
    cookie = upskiiSignIn(identity);
    cookies.set(identity.userId, cookie);
    cookie.catch(() => cookies.delete(identity.userId));
  }
  return cookie;
}

/** API caller for beforeAll/afterAll hooks (tests use the fixture). */
export async function suiteApi(identity: UpskiiIdentity) {
  return upskiiApp(await sessionCookie(identity));
}

export function suiteIdentities() {
  return upskiiActors(loadActors());
}

interface CreateSpec<T> {
  what: string;
  creator: Role;
  /** Owner whose purge guarantees removal; defaults to the creator. */
  owner?: Role;
  api: UpskiiApp;
  id: (value: T) => string;
  /** Product cleanup; omit for objects without a DELETE API. */
  cleanup?: (id: string, value: T) => Cleanup;
}

interface Entry {
  what: string;
  api: UpskiiApp;
  cleanup: Cleanup;
  removed: boolean;
}

/**
 * Tracks every created object in the ledger before the test relies on it
 * (pending first, then with its server id) and removes it through the
 * product API, in reverse order, when the test does not do so itself.
 */
export class Resources {
  private readonly entries: Entry[] = [];
  constructor(private readonly track: Track) {}

  async create<T>(spec: CreateSpec<T>, create: () => Promise<T>) {
    const base = {
      key: ledgerKey(spec.what),
      kind: 'upskii-object' as const,
      actor: ACTOR[spec.creator],
      coveredBy: owners.upskii(spec.owner ?? spec.creator),
      meta: { what: spec.what },
    };
    this.track(base);
    const value = await create();
    const id = spec.id(value);
    const cleanup = spec.cleanup?.(id, value);
    this.track({ ...base, id, ...(cleanup ? { cleanup } : {}) });
    const entry: Entry | null = cleanup
      ? { what: spec.what, api: spec.api, cleanup, removed: false }
      : null;
    if (entry) this.entries.push(entry);
    return {
      id,
      value,
      /** Happy-path removal; asserts the product DELETE succeeded. */
      remove: async (expected = [200]) => {
        if (!entry) throw new Error(`${spec.what} has no product cleanup`);
        return this.removeEntry(entry, expected);
      },
    };
  }

  private async removeEntry(entry: Entry, expected: number[]) {
    if (entry.removed) return null;
    const { method, path, body } = entry.cleanup;
    const { json } = await entry.api(`remove ${entry.what}`, path, {
      ...jsonInit(method, body ?? {}),
      expect: expected,
    });
    entry.removed = true;
    return json as Json;
  }

  /** Removes what is left; returns failures (labels and statuses only). */
  async flush() {
    const failures: string[] = [];
    for (const entry of [...this.entries].reverse()) {
      try {
        await this.removeEntry(entry, [200, 201, 204]);
      } catch (error) {
        failures.push(`${entry.what}: ${(error as Error).message}`);
      }
    }
    return failures;
  }
}

/** Runs a test body with tracked resources and always flushes them. */
export async function withResources(
  track: Track,
  body: (resources: Resources) => Promise<void>
) {
  const resources = new Resources(track);
  let failure: { error: unknown } | null = null;
  try {
    await body(resources);
  } catch (error) {
    failure = { error };
  }
  // Product-API cleanup always runs; the owner purge is the backstop.
  const failures = await resources.flush();
  if (failures.length)
    console.warn(`Upskii E2E cleanup failures: ${failures.join('; ')}`);
  if (failure) throw failure.error;
  if (failures.length)
    throw new Error(`Cleanup failed: ${failures.join('; ')}`);
}

/**
 * The run's private class. Regular class creation needs Turnstile, so the
 * provisioner seeds one per teacher. Seeding refuses (409) once the class has
 * invitations or members, so the id is cached beside the ledger and reused by
 * every suite and worker restart in this run.
 */
export async function ensureSeedClass(teacher: UpskiiIdentity, track: Track) {
  const preset = (teacher as UpskiiIdentity & { classId?: string }).classId;
  if (preset) return preset;
  const cache = join(dirname(run.ledgerPath), 'upskii-seed-class.json');
  const saved = readSeedCache(cache);
  if (saved?.teacherId === teacher.userId && saved.classId)
    return saved.classId;
  const base = {
    key: `upskii-object:${run.runLabel}:seed-class`,
    kind: 'upskii-object' as const,
    actor: 'teacher' as const,
    coveredBy: owners.upskii('teacher'),
  };
  track(base);
  const classId = await upskiiProvisioner(
    requiredInput('UPSKII_QA_PROVISIONER_TOKEN')
  ).seedClass(teacher.userId);
  track({
    ...base,
    id: classId,
    // Shared by every suite in the run; the teacher purge removes it.
    cleanup: {
      method: 'DELETE',
      path: '/api/upskii/classes',
      body: { classId },
    },
  });
  writeSeedCache(cache, { teacherId: teacher.userId, classId });
  return classId;
}

type SeedCache = { teacherId?: string; classId?: string };

/** Reads the cache in one call; a missing or unreadable file is a miss. */
function readSeedCache(path: string): SeedCache | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SeedCache;
  } catch {
    return null;
  }
}

/**
 * Writes the cache atomically: a fresh temp file created exclusively (0600)
 * in the 0700 run directory, written through its descriptor, then renamed
 * over the cache, so no reader sees a partial file and no existing path is
 * reused.
 */
function writeSeedCache(path: string, value: SeedCache) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    writeSync(fd, JSON.stringify(value));
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export async function isActiveMember(
  teacherApi: UpskiiApp,
  classId: string,
  userId: string
) {
  const json = await getJson(
    teacherApi,
    'class detail',
    `/api/upskii/classes/${classId}`
  );
  return list<{ userId?: string; status?: string }>(
    json,
    'detail.classMembers'
  ).some((member) => member.userId === userId && member.status === 'active');
}

/** Teacher invites the student by email and the student accepts. */
export async function inviteAndAccept(input: {
  teacherApi: UpskiiApp;
  studentApi: UpskiiApp;
  classId: string;
  student: UpskiiIdentity;
  track: Track;
  label: (what: string) => string;
}) {
  const { teacherApi, studentApi, classId, student, track } = input;
  track({
    key: ledgerKey('membership'),
    kind: 'upskii-object',
    actor: 'teacher',
    id: `${classId}:${student.userId}`,
    coveredBy: owners.upskii('teacher'),
    cleanup: {
      method: 'DELETE',
      path: '/api/upskii/memberships',
      body: { classId, userId: student.userId },
    },
  });
  const resources = new Resources(track);
  const invitation = await resources.create(
    {
      what: 'invitation',
      creator: 'teacher',
      api: teacherApi,
      id: (value: Json) => field(value, 'invitation.id'),
      cleanup: (invitationId) => ({
        method: 'DELETE',
        path: '/api/upskii/invitations',
        body: { invitationId },
      }),
    },
    () =>
      sendJson(
        teacherApi,
        'invite student',
        'POST',
        '/api/upskii/invitations',
        {
          classId,
          recipientEmail: student.email,
          role: 'student',
          message: input.label('invitation'),
        }
      )
  );
  const pending = await getJson(
    studentApi,
    'learner invitations',
    '/api/upskii/invitations'
  );
  const seen = list<{ id?: string }>(pending, 'invitations').some(
    (item) => item.id === invitation.id
  );
  await sendJson(
    studentApi,
    'accept invitation',
    'POST',
    '/api/upskii/invitations',
    {
      invitationId: invitation.id,
    }
  );
  return { invitationId: invitation.id, seenByLearner: seen };
}

export async function removeMember(
  teacherApi: UpskiiApp,
  classId: string,
  userId: string
) {
  if (!(await isActiveMember(teacherApi, classId, userId))) return false;
  await sendJson(
    teacherApi,
    'remove member',
    'DELETE',
    '/api/upskii/memberships',
    {
      classId,
      userId,
    }
  );
  return true;
}

/** Status of an unauthenticated call (no cookie) on a product host. */
export async function anonymousStatus(
  host: 'upskiiApp' | 'upskiiAdmin',
  method: 'GET' | Method,
  path: string,
  expected: number[]
) {
  const init =
    method === 'GET'
      ? {}
      : jsonInit(
          method,
          {},
          { origin: HOSTS[host], 'sec-fetch-site': 'same-origin' }
        );
  return (
    await call(fetch, `anonymous ${method} ${path}`, on(host, path), {
      ...init,
      expect: expected,
    })
  ).status;
}

/** Signed-in call on admin.upskii.com with same-origin headers. */
export async function adminStatus(
  identity: UpskiiIdentity,
  method: 'GET' | Method,
  path: string,
  expected: number[]
) {
  const headers = {
    cookie: await sessionCookie(identity),
    origin: HOSTS.upskiiAdmin,
    'sec-fetch-site': 'same-origin',
    accept: 'application/json',
  };
  const init = method === 'GET' ? { headers } : jsonInit(method, {}, headers);
  return (
    await call(
      fetch,
      `${identity.role} ${method} ${path}`,
      on('upskiiAdmin', path),
      {
        ...init,
        expect: expected,
      }
    )
  ).status;
}

const ERROR_COPY =
  /Không tải được trang|Không tải được nội dung|We could not load this content|Page not found|Không tìm thấy trang này|You do not have access to this content|Bạn không có quyền xem nội dung này/u;
const PAID_AI =
  /^\/api\/upskii\/(?:ai-chat|tutor\/ask|tutor\/sessions\/[^/]+\/ask|writing|editor\/assist|english\/(?:coach|grammar|practice|audio)|materials\/summarize|assistant\/compose)$/u;

export interface PageReport {
  status: number;
  origin: string;
  pathname: string;
  errorBoundary: boolean;
  textLength: number;
  serverErrors: string[];
  paidAiCalls: string[];
}

/** Loads one page and reports status, error boundary, 5xx and paid AI calls. */
export async function renderPage(
  context: BrowserContext,
  host: 'upskiiApp' | 'upskiiAdmin',
  path: string
): Promise<PageReport> {
  const page = await context.newPage();
  const serverErrors: string[] = [];
  const paidAiCalls: string[] = [];
  // Origins and paths only: query strings can carry codes.
  page.on('response', (response) => {
    if (response.status() < 500) return;
    const url = new URL(response.url());
    serverErrors.push(`${response.status()} ${url.origin}${url.pathname}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && PAID_AI.test(url.pathname))
      paidAiCalls.push(url.pathname);
  });
  try {
    const response = await page.goto(on(host, path), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page
      .waitForLoadState('networkidle', { timeout: 8_000 })
      .catch(() => undefined);
    const url = new URL(page.url());
    const errorBoundary =
      (await page.locator('main[role="alert"]').count()) > 0 ||
      (await page.getByText(ERROR_COPY).count()) > 0;
    const text = await page.locator('body').innerText({ timeout: 5_000 });
    return {
      status: response?.status() ?? 0,
      origin: url.origin,
      pathname: url.pathname,
      errorBoundary,
      textLength: text.trim().length,
      serverErrors,
      paidAiCalls,
    };
  } finally {
    await page.close();
  }
}

export { API_COVERAGE, INVENTORY_FAMILIES } from './upskii-coverage';

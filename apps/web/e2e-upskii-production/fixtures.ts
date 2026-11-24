import {
  test as base,
  type Browser,
  type BrowserContext,
  expect,
} from '@playwright/test';
import { type Actors, loadActors } from './actors';
import { Ledger, type ResourceRecord } from './ledger';
import {
  allowedBrowserRequest,
  HOSTS,
  marker,
  readRunConfig,
  required,
} from './policy';
import { githubOidcAuth, type QaUser, tuturuuuQaClient } from './tuturuuu-qa';
import {
  type UpskiiApp,
  type UpskiiIdentity,
  upskiiApp,
  upskiiBrowserCookie,
  upskiiSignIn,
} from './upskii';

/**
 * Suite fixtures. Tests get QA actors, signed-in browser contexts and API
 * callers, and `track()` to record every object they create BEFORE relying
 * on it. Each tracked object names the owner whose deletion guarantees it
 * (`coveredBy`), so cleanup holds even when a test dies mid-way; tests should
 * still delete what they create through the product API in a `finally`.
 */

export const run = readRunConfig(process.env);
const ledger = new Ledger(run.ledgerPath);
const qa = tuturuuuQaClient(githubOidcAuth(process.env));

export const owners = {
  upskii: (role: 'teacher' | 'student' | 'outsider') =>
    `upskii-identity:${run.runLabel}:${role}`,
  tuturuuu: `tuturuuu-qa-run:${run.runLabel}`,
};

/**
 * One Upskii password sign-in per identity per worker: sign-in is
 * rate-limited, and the suites need many contexts per identity.
 */
const upskiiSessions = new Map<string, Promise<string>>();
function upskiiSession(identity: UpskiiIdentity) {
  let session = upskiiSessions.get(identity.userId);
  if (!session) {
    session = upskiiSignIn(identity);
    session.catch(() => upskiiSessions.delete(identity.userId));
    upskiiSessions.set(identity.userId, session);
  }
  return session;
}

/** Call after a test signs out: the cached sessions are revoked. */
export function forgetUpskiiSessions() {
  upskiiSessions.clear();
}

async function fencedContext(browser: Browser, violations: string[]) {
  const context = await browser.newContext();
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (allowedBrowserRequest(request.url(), request.method()))
      await route.continue();
    else {
      // URLs can carry codes and tokens: record the origin only.
      violations.push(`blocked write to ${new URL(request.url()).origin}`);
      await route.abort('blockedbyclient');
    }
  });
  return context;
}

export const test = base.extend<{
  actors: Actors;
  /** Title for created Upskii/Tuturuuu objects; carries the run marker. */
  label: (what: string) => string;
  track: (record: Omit<ResourceRecord, 'suite'>) => void;
  tuturuuuContext: (user: QaUser) => Promise<BrowserContext>;
  upskiiContext: (identity: UpskiiIdentity) => Promise<BrowserContext>;
  upskiiApi: (identity: UpskiiIdentity) => Promise<UpskiiApp>;
  anonymousContext: () => Promise<BrowserContext>;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
  actors: async ({}, use) => use(loadActors()),
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
  label: async ({}, use) => use((what) => marker(run.runLabel, what)),
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
  track: async ({}, use, info) => {
    const suite = info.file.split('/').pop()?.replace('.e2e.ts', '') ?? '?';
    await use((record) => {
      if (!record.coveredBy) throw new Error('Tracked objects need an owner');
      ledger.register({ ...record, suite });
    });
  },
  tuturuuuContext: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    const violations: string[] = [];
    await use(async (user) => {
      const context = await fencedContext(browser, violations);
      const cookies = [
        ...(await qa.session(user.userId, HOSTS.tuturuuu)),
        ...(await qa.session(user.userId, HOSTS.meet)),
      ];
      await context.addCookies(
        cookies.map((c) => ({
          name: c.name,
          value: c.value,
          ...(c.domain
            ? { domain: c.domain, path: c.path }
            : { url: HOSTS.tuturuuu }),
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite:
            c.sameSite === 'none'
              ? 'None'
              : c.sameSite === 'strict'
                ? 'Strict'
                : 'Lax',
        }))
      );
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((c) => c.close()));
    expect(violations, 'No writes outside the product origins').toEqual([]);
  },
  upskiiContext: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    const violations: string[] = [];
    await use(async (identity) => {
      const context = await fencedContext(browser, violations);
      await context.addCookies([
        upskiiBrowserCookie(await upskiiSession(identity)),
      ]);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((c) => c.close()));
    expect(violations, 'No writes outside the product origins').toEqual([]);
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
  upskiiApi: async ({}, use) => {
    await use(async (identity) => upskiiApp(await upskiiSession(identity)));
  },
  anonymousContext: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    const violations: string[] = [];
    await use(async () => {
      const context = await fencedContext(browser, violations);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((c) => c.close()));
    expect(violations).toEqual([]);
  },
});

export { expect };
export const requiredInput = (name: string) => required(process.env, name);

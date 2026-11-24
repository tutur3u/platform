// Shared helpers for the roadmap preview capture: Playwright resolution,
// local dev-session sign-in, and in-page API calls.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const WEB = process.env.PREVIEW_WEB_ORIGIN ?? 'http://localhost:7803';
export const TASKS =
  process.env.PREVIEW_TASKS_ORIGIN ?? 'http://localhost:7809';
export const CALENDAR =
  process.env.PREVIEW_CALENDAR_ORIGIN ?? 'http://localhost:7806';
export const MEET = process.env.PREVIEW_MEET_ORIGIN ?? 'http://localhost:7807';

// Bun's isolated linker only exposes Playwright and sharp inside workspaces
// that depend on them, so resolve from apps/web.
const webRequire = createRequire(path.join(REPO_ROOT, 'apps/web/package.json'));
export const { chromium } = webRequire('playwright');
export const sharp = webRequire('sharp');

export const FIXTURE = {
  workspaceName: 'Sorbet Studio',
  owner: {
    email: 'linh.tran.sorbet@example.com',
    displayName: 'Linh Tran',
    handle: 'linh_tran_studio',
  },
  teammate: {
    email: 'alex.kim.sorbet@example.com',
    displayName: 'Alex Kim',
    handle: 'alex_kim_studio',
  },
};

/** Signs the page in through the local-only dev-session endpoint. */
export async function signIn(page, email, locale = 'en') {
  await page.goto(`${WEB}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 300000,
  });
  let result;
  for (let attempt = 0; attempt < 5; attempt++) {
    result = await page.evaluate(
      async ({ email, locale }) => {
        const res = await fetch('/api/auth/dev-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completeOnboarding: true, email, locale }),
        });
        return { status: res.status, body: (await res.text()).slice(0, 200) };
      },
      { email, locale }
    );
    if (result.status === 200) return;
    // Concurrent sign-ins of one account can race; retry with backoff.
    await page.waitForTimeout(2000 * (attempt + 1));
  }
  throw new Error(`dev-session failed: ${result.status} ${result.body}`);
}

/** Calls an app API with the signed-in context's cookies. */
export async function api(page, method, apiPath, body, origin = WEB) {
  const res = await page.context().request.fetch(`${origin}${apiPath}`, {
    method,
    headers: { 'content-type': 'application/json' },
    data: body === undefined ? undefined : JSON.stringify(body),
    timeout: 300000,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (res.status() >= 400) {
    throw new Error(
      `${method} ${origin}${apiPath} -> ${res.status()} ${text.slice(0, 300)}`
    );
  }
  return json;
}

export function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/**
 * Establishes a satellite app session. Plain-localhost Supabase cookies are
 * host-only, so web's cross-app `/verify-token` redirect is captured and
 * opened with the Supabase cookies cleared (see local-e2e.mdx). Returns the
 * context's storage state for reuse across viewports.
 */
export async function satelliteStorageState(
  browser,
  origin,
  nextPath,
  email,
  { verifyPath = '/verify-token', basePath = '' } = {}
) {
  const ctx = await browser.newContext();
  await mountBasePathApi(ctx, origin, basePath);
  const page = await ctx.newPage();
  try {
    await signIn(page, email);
    let captured = null;
    await page.route('**/verify-token**', (route) => {
      captured = route.request().url();
      route.abort();
    });
    const returnUrl = `${origin}${verifyPath}?nextUrl=${encodeURIComponent(nextPath)}`;
    await page
      .goto(`${WEB}/login?returnUrl=${encodeURIComponent(returnUrl)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300000,
      })
      .catch(() => {});
    for (let i = 0; i < 80 && !captured; i++) await page.waitForTimeout(500);
    if (!captured) throw new Error(`No verify-token redirect for ${origin}`);
    await page.unroute('**/verify-token**');
    await ctx.clearCookies({ name: /^sb-/ });
    await page.goto(captured, {
      waitUntil: 'domcontentloaded',
      timeout: 300000,
    });
    await page.waitForTimeout(2000);
    return await ctx.storageState();
  } finally {
    await ctx.close();
  }
}

/**
 * Apps mounted under a base path expect the host to serve `/api/*` in place
 * (as the production routing does). A plain localhost run has no such host,
 * so unprefixed API requests are sent to the mount instead.
 */
export async function mountBasePathApi(ctx, origin, basePath) {
  if (!basePath) return;
  const host = new URL(origin).origin;
  await ctx.route(`${host}/api/**`, (route) => {
    const url = new URL(route.request().url());
    url.pathname = `${basePath}${url.pathname}`;
    return route.continue({ url: url.toString() });
  });
}

/** Local Supabase REST with the service key (PREVIEW_SB_URL / PREVIEW_SB_SECRET). */
export async function admin(method, route, body) {
  const res = await fetch(`${process.env.PREVIEW_SB_URL}${route}`, {
    method,
    headers: {
      apikey: process.env.PREVIEW_SB_SECRET,
      authorization: `Bearer ${process.env.PREVIEW_SB_SECRET}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

export const MEETING_NAME = 'Design review: spring launch';

/**
 * Inserts a fresh fixture meeting. A room ends when its last participant
 * leaves, so every capture joins a new one. Hosting through the API is limited
 * to staff, and the room only needs the row.
 */
export async function createMeeting(state) {
  const [meeting] = await admin('POST', '/rest/v1/workspace_meetings', {
    ws_id: state.wsId,
    name: MEETING_NAME,
    time: new Date().toISOString(),
    creator_id: state.linhId,
  });
  return meeting.id;
}

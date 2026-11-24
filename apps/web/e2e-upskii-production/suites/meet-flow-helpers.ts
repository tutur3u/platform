import { randomBytes } from 'node:crypto';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { Actors } from '../actors';
import { expect, run, owners } from '../fixtures';
import type { ResourceRecord } from '../ledger';
import { HOSTS, on } from '../policy';

/**
 * Helpers for the meet-flow suite. Copy comes from the en bundles:
 * apps/meet/messages/en.json (meet.call, meet.mira_consent), apps/web
 * messages (login.*) and Upskii's tuturuuu-link/Settings.tsx. Nothing here
 * logs a cookie, token, state or password.
 */

type Track = (record: Omit<ResourceRecord, 'suite'>) => void;

export const UPSKII_LINK_PATH = '/api/upskii/integrations/tuturuuu';
export const TUTURUUU_LINK_PATH = '/api/v1/integrations/upskii/link';
export const LINK_STATE_COOKIE = '__Host-upskii-tuturuuu-link';

export const COPY = {
  connect: 'Connect Tuturuuu account',
  linked: 'Tuturuuu account linked.',
  stateInvalid: 'That link request expired. Start again.',
  mismatch:
    'Sign in to the Upskii account that started the link, then try again.',
  conflict:
    'One of these accounts is already linked to another account. Disconnect it first.',
  disconnect: 'Disconnect',
  confirmDisconnect: 'Disconnect Tuturuuu',
  consentNotice: /Continuing links this account to /,
  continueAs: /^Continue as /,
  miraBox:
    'Mira, our AI assistant, may be turned on in this meeting to provide a helpful experience (notes, captions, answers).',
  miraIndicator: /^Mira is on, turned on by /,
} as const;

/**
 * Mira stays out of QA runs until meetings and workspaces holding Mira
 * consent evidence (deletion RESTRICT) have a supported cleanup path, so
 * the suite never creates evidence it cannot remove.
 */
export const MIRA_IN_E2E = false;
export const MIRA_HELD =
  'Mira is held out of production E2E until Mira evidence has a supported cleanup path';

export const MIRA_UNAVAILABLE =
  'Room Mira is unavailable for the QA run workspace (Meet AI not enabled or no stored 18+ audience attestation)';

export function need(actors: Actors) {
  if (!actors.tuturuuu || !actors.upskii)
    throw new Error('meet-flow needs Tuturuuu and Upskii run actors');
  return { tt: actors.tuturuuu, up: actors.upskii };
}

export const randomValue = () => randomBytes(24).toString('base64url');

const upskiiHeaders = {
  origin: HOSTS.upskiiApp,
  'sec-fetch-site': 'same-origin',
  accept: 'application/json',
};

/** One context holding the Tuturuuu session and an Upskii session. */
export async function bothSignedIn(
  tuturuuuCtx: BrowserContext,
  upskiiCtx: BrowserContext
) {
  const upskii = (await upskiiCtx.cookies()).filter((c) =>
    c.domain.endsWith('upskii.com')
  );
  await tuturuuuCtx.addCookies(upskii);
  await upskiiCtx.close();
  return tuturuuuCtx;
}

// ---------------------------------------------------------------- Upskii

export type UpskiiLinkStatus = {
  enabled: boolean;
  confirmed?: boolean;
  link: { linkedAt: string; tuturuuuEmail: string | null } | null;
};

export async function upskiiLinkStatus(ctx: BrowserContext) {
  const res = await ctx.request.get(on('upskiiApp', UPSKII_LINK_PATH), {
    headers: upskiiHeaders,
    maxRedirects: 0,
  });
  expect(res.status(), 'Upskii link status').toBe(200);
  return (await res.json()) as UpskiiLinkStatus;
}

export async function tuturuuuLinkStatus(ctx: BrowserContext) {
  const res = await ctx.request.get(on('tuturuuu', TUTURUUU_LINK_PATH), {
    headers: { accept: 'application/json' },
    maxRedirects: 0,
  });
  expect(res.status(), 'Tuturuuu link status').toBe(200);
  return (await res.json()) as {
    canLink: boolean;
    link: { linkId: string; upskiiEmail: string | null } | null;
  };
}

export async function upskiiDisconnect(ctx: BrowserContext) {
  return ctx.request.delete(on('upskiiApp', UPSKII_LINK_PATH), {
    headers: { ...upskiiHeaders, 'content-type': 'application/json' },
    data: '{}',
    maxRedirects: 0,
  });
}

/** Starts a link like the card does; returns the sealed request's `state`. */
export async function startConnect(ctx: BrowserContext) {
  const res = await ctx.request.post(
    on('upskiiApp', `${UPSKII_LINK_PATH}/connect`),
    {
      headers: { ...upskiiHeaders, 'content-type': 'application/json' },
      data: '{}',
      maxRedirects: 0,
    }
  );
  expect(res.status(), 'Upskii connect').toBe(200);
  const { location } = (await res.json()) as { location: string };
  const login = new URL(location);
  expect(login.origin).toBe(HOSTS.tuturuuu);
  const returnUrl = new URL(login.searchParams.get('returnUrl') ?? '');
  expect(returnUrl.origin).toBe(HOSTS.upskiiApp);
  const state = returnUrl.searchParams.get('state');
  if (!state) throw new Error('Connect returned no state');
  return state;
}

export function callbackUrl(state: string, token: string) {
  const url = new URL(on('upskiiApp', `${UPSKII_LINK_PATH}/callback`));
  url.searchParams.set('state', state);
  url.searchParams.set('token', token);
  return url.toString();
}

export const linkCard = (page: Page) =>
  page.locator('section[aria-label="Tuturuuu"]');

export async function expectLinkResult(page: Page, code: string, text: string) {
  await expect(page).toHaveURL(
    (u) =>
      u.origin === HOSTS.upskiiApp && u.searchParams.get('tuturuuu') === code,
    { timeout: 30_000 }
  );
  await expect(linkCard(page).locator('p[role="status"]')).toHaveText(text);
}

/**
 * Card → Tuturuuu login in account-link mode → "Continue as" → callback.
 * Returns the `?tuturuuu=` result the callback redirected to.
 */
export async function linkThroughConsent(page: Page, settingsPath: string) {
  await page.goto(on('upskiiApp', settingsPath));
  await linkCard(page).getByRole('button', { name: COPY.connect }).click();
  await page.waitForURL(
    (u) => u.origin === HOSTS.tuturuuu && /\/login$/u.test(u.pathname),
    { timeout: 30_000 }
  );
  await expect(page.getByText(COPY.consentNotice)).toBeVisible();
  await page.getByRole('button', { name: COPY.continueAs }).click();
  await page.waitForURL(
    (u) => u.origin === HOSTS.upskiiApp && u.searchParams.has('tuturuuu'),
    { timeout: 45_000 }
  );
  return new URL(page.url()).searchParams.get('tuturuuu');
}

export async function upskiiSession(ctx: BrowserContext) {
  const res = await ctx.request.get(on('upskiiAuth', '/api/auth/get-session'), {
    headers: { origin: HOSTS.upskiiApp, accept: 'application/json' },
    maxRedirects: 0,
  });
  expect(res.status(), 'Upskii get-session').toBe(200);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as {
    user?: { email?: string };
    session?: unknown;
  } | null;
}

/** Records the link on both sides before the test relies on it. */
export function trackLink(
  track: Track,
  role: 'teacher' | 'student',
  id?: string
) {
  track({
    key: `meet-flow:tuturuuu-upskii-link:${run.runLabel}:${role}`,
    kind: 'tuturuuu-upskii-link',
    actor: 'host',
    coveredBy: owners.tuturuuu,
    ...(id ? { id } : {}),
  });
  track({
    key: `meet-flow:upskii-link:${run.runLabel}:${role}`,
    kind: 'upskii-link',
    actor: role === 'teacher' ? 'teacher' : 'learner',
    coveredBy: owners.upskii(role),
    ...(id ? { id } : {}),
  });
}

// ------------------------------------------------------------------ Meet

const meetHeaders = { origin: HOSTS.meet, accept: 'application/json' };

export async function meetGet<T>(ctx: BrowserContext, path: string) {
  const res = await ctx.request.get(on('meet', path), {
    headers: meetHeaders,
    maxRedirects: 0,
  });
  const body = res.headers()['content-type']?.includes('application/json')
    ? ((await res.json()) as T)
    : null;
  return { status: res.status(), body };
}

/** Creates a run-workspace meeting; tracked before the POST and with its id. */
export async function createMeeting(
  ctx: BrowserContext,
  track: Track,
  wsId: string,
  name: string,
  slot: string
) {
  const key = `meet-flow:meeting:${run.runLabel}:${slot}`;
  const base = {
    key,
    kind: 'tuturuuu-meeting' as const,
    actor: 'host' as const,
    coveredBy: owners.tuturuuu,
  };
  track(base);
  const res = await ctx.request.post(
    on('tuturuuu', `/api/v1/workspaces/${wsId}/meetings`),
    {
      headers: { origin: HOSTS.tuturuuu, 'content-type': 'application/json' },
      data: { name, time: new Date().toISOString() },
      maxRedirects: 0,
    }
  );
  expect([200, 201], 'create meeting').toContain(res.status());
  const id = ((await res.json()) as { meeting?: { id?: string } }).meeting?.id;
  if (!id) throw new Error('Meeting create returned no id');
  track({ ...base, id, meta: { wsId } });
  return id;
}

export async function deleteMeeting(
  ctx: BrowserContext,
  wsId: string,
  meetingId: string
) {
  const res = await ctx.request.delete(
    on('tuturuuu', `/api/v1/workspaces/${wsId}/meetings/${meetingId}`),
    { headers: { origin: HOSTS.tuturuuu }, maxRedirects: 0 }
  );
  return res.status();
}

/** The room link from the meeting page ("Join call" → /r/{code}). */
export async function roomUrlFor(page: Page, wsId: string, meetingId: string) {
  await page.goto(on('meet', `/${wsId}/meetings/${meetingId}`));
  const href = await page
    .getByRole('link', { name: 'Join call' })
    .getAttribute('href', { timeout: 30_000 });
  if (!href) throw new Error('Meeting page has no Join call link');
  const url = new URL(href, HOSTS.meet);
  expect(url.origin).toBe(HOSTS.meet);
  return url.toString();
}

/** Name setup if asked, Mira join box, then "Join now". */
export async function enterRoom(
  page: Page,
  roomUrl: string,
  name: string,
  miraBox: 'keep' | 'untick' = 'keep'
) {
  await page
    .context()
    .grantPermissions(['camera', 'microphone'], { origin: HOSTS.meet });
  await page.goto(roomUrl);
  const nameForm = page.getByRole('heading', {
    name: 'What should we call you?',
  });
  const join = page.getByRole('button', { name: 'Join now', exact: true });
  await expect(nameForm.or(join)).toBeVisible({ timeout: 30_000 });
  if (await nameForm.isVisible()) {
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Save name and continue' }).click();
    await expect(join, 'name saved without a browser check').toBeVisible({
      timeout: 30_000,
    });
  }
  if (miraBox === 'untick') {
    const box = page.getByRole('checkbox', { name: COPY.miraBox });
    if ((await box.count()) && (await box.first().isChecked()))
      await box.first().uncheck();
  }
  await join.click();
}

const participantsButton = (page: Page) =>
  page.getByRole('button', { name: /^Participants \(\d+\)$/u }).first();

/** In the call: the Participants control exists only after admission. */
export async function expectInCall(page: Page) {
  const switchDevice = page.getByRole('button', {
    name: 'Switch to this device',
  });
  await expect(participantsButton(page).or(switchDevice)).toBeVisible({
    timeout: 45_000,
  });
  if (await switchDevice.isVisible()) await switchDevice.click();
  await expect(participantsButton(page)).toBeVisible({ timeout: 45_000 });
}

export async function isInCall(page: Page) {
  return participantsButton(page).isVisible();
}

/** Admits the first waiting person if the host's waiting banner shows. */
export async function admitIfWaiting(host: Page, timeout = 10_000) {
  const banner = host.getByText(/^Waiting to join \(\d+\)$/u);
  const shown = await banner
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false);
  if (!shown) return false;
  const admit = host.getByRole('button', { name: /^Admit: /u }).first();
  if (!(await admit.isVisible())) await participantsButton(host).click();
  await admit.click();
  return true;
}

export type MiraRoom =
  | { available: false; joinDefault?: boolean; joinRevision?: number }
  | {
      available: true;
      acceptance: { revision: number } | null;
      choice: 'on' | 'off' | null;
      ready: boolean;
      canAccept: boolean;
      status: { active: boolean; included: number; admitted: number };
    };

export async function miraRoom(ctx: BrowserContext, meetingId: string) {
  const { status, body } = await meetGet<MiraRoom>(
    ctx,
    `/api/meet-call/${meetingId}/mira-room`
  );
  expect(status, 'mira-room read').toBe(200);
  return body as MiraRoom;
}

/**
 * Whether room Mira runs for this meeting. A not-yet-admitted read still
 * carries the join default; a disabled one carries nothing.
 */
export async function miraAvailable(ctx: BrowserContext, meetingId: string) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const mira = await miraRoom(ctx, meetingId);
    if (mira.available) return true;
    if (!('joinDefault' in mira) || Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/** Host: header chip "Turn on Mira" → 18+ confirmation → accept. */
export async function hostTurnOnMira(host: Page) {
  await host
    .getByRole('button', { name: 'Turn on Mira', exact: true })
    .first()
    .click();
  const panel = host.getByRole('dialog', {
    name: 'Turn on Mira for this meeting',
  });
  await panel
    .getByRole('checkbox', { name: 'Everyone in this meeting is 18 or older' })
    .check();
  await panel.getByRole('button', { name: 'Accept and turn on' }).click();
}

/** Participant: the indicator's choice panel, ticked or unticked, Confirm. */
export async function chooseMira(page: Page, choice: 'on' | 'off') {
  const panel = page.getByRole('dialog', { name: COPY.miraIndicator });
  const chip = page.getByRole('button', { name: COPY.miraIndicator }).first();
  await expect(panel.or(chip).first()).toBeVisible({ timeout: 30_000 });
  if (!(await panel.isVisible())) await chip.click();
  const done = choice === 'on' ? 'Mira is on for you.' : 'Mira is off for you.';
  const status = panel.locator('p[role="status"]');
  await expect(status).toBeVisible();
  if ((await status.textContent())?.trim() === done) return;
  await panel
    .getByRole('checkbox', { name: COPY.miraBox })
    .setChecked(choice === 'on');
  await panel.getByRole('button', { name: 'Confirm', exact: true }).click();
}

/** The realtime join token's claims. Only claims are read; never logged. */
export function realtimeClaims(token: string) {
  const [encoded] = token.split('.');
  return JSON.parse(
    Buffer.from(encoded ?? '', 'base64url').toString('utf8')
  ) as {
    admission?: string;
    role?: string;
  };
}

/** Opens the Activities hub and the Upskii presenter, if Meet offers it. */
export async function openUpskiiPresenter(page: Page) {
  await page
    .getByRole('button', { name: /^Activities/u })
    .first()
    .click();
  const tile = page.getByRole('button', { name: /^(Start|Open) Upskii$/u });
  const offered = await tile
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!offered) return null;
  await tile.first().click();
  const panel = page
    .locator('section[aria-label="Upskii"], aside[aria-label="Upskii"]')
    .first();
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * First class → first lesson (else assessment) → Present/Launch, then the
 * presenting view. Returns what happened; an empty state is a valid answer.
 */
export async function presentFirstUpskiiItem(panel: Locator) {
  await expect(panel.getByText("Upskii isn't linked")).toHaveCount(0);
  const classes = panel.getByRole('listitem').getByRole('button');
  const empty = panel.getByText('No Upskii classes yet');
  await expect(classes.first().or(empty)).toBeVisible({ timeout: 30_000 });
  if (await empty.isVisible()) return 'linked teacher has no Upskii classes';
  await classes.first().click();
  const items = panel.getByRole('button', { name: /(Present|Launch)$/u });
  const noLessons = panel.getByText('No lessons in this class');
  await expect(items.first().or(noLessons)).toBeVisible({ timeout: 30_000 });
  if (await noLessons.isVisible()) {
    await panel.getByRole('tab', { name: 'Assessments' }).click();
    const none = panel.getByText('No assessments in this class');
    await expect(items.first().or(none)).toBeVisible({ timeout: 30_000 });
    if (await none.isVisible())
      return 'first class has no lessons or assessments';
  }
  await items.first().click();
  await expect(panel.getByText('Presenting', { exact: true })).toBeVisible();
  const href = await panel
    .getByRole('link', { name: 'Open in Upskii' })
    .getAttribute('href');
  expect(href && new URL(href).origin).toBe(HOSTS.upskiiApp);
  return 'presented one Upskii item';
}

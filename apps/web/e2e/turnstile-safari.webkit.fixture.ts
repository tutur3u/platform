import {
  createTurnstileRetryScheduler,
  onTurnstilePageRestore,
  SAFARI_SAFE_TURNSTILE_OPTIONS,
  TURNSTILE_SCRIPT_URL,
  withTurnstileCsp,
} from '@tuturuuu/cloudflare/turnstile/client';
import { expect, type Page, test } from '@playwright/test';

const HARNESS = 'https://turnstile-harness.test/';
const NONCE = 'turnstile-webkit-nonce';
// Cloudflare's public test keys: always passes, always fails.
const PASS_KEY = '1x00000000000000000000AA';
const BLOCK_KEY = '2x00000000000000000000AB';
// The forms Worker policy: a nonce with strict-dynamic and nothing else.
const FORMS_POLICY = `script-src 'nonce-${NONCE}' 'strict-dynamic'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`;

function harness(siteKey: string, policy: string) {
  const options = JSON.stringify(SAFARI_SAFE_TURNSTILE_OPTIONS);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="csp-nonce" content="${NONCE}"></head><body>
<div id="cf-turnstile-1"></div>
<script nonce="${NONCE}">
window.__events = [];
window.__violations = [];
document.addEventListener('securitypolicyviolation', (event) => {
  window.__violations.push(event.violatedDirective + ' ' + event.blockedURI);
});
const createScheduler = ${createTurnstileRetryScheduler.toString()};
const onRestore = ${onTurnstilePageRestore.toString()};
window.__ready = () => {
  const options = ${options};
  let widgetId;
  const scheduler = createScheduler({
    reset: () => { window.__events.push('reset'); window.turnstile.reset(widgetId); },
    onGiveUp: (code) => window.__events.push('give-up ' + code),
    baseDelayMs: 500,
    maxAttempts: 3,
  });
  onRestore(() => { window.__token = ''; window.__events.push('restore'); window.turnstile.reset(widgetId); });
  widgetId = window.turnstile.render('#cf-turnstile-1', {
    sitekey: '${siteKey}',
    appearance: options.appearance,
    execution: options.execution,
    'refresh-expired': options.refreshExpired,
    'refresh-timeout': options.refreshTimeout,
    retry: options.retry,
    'retry-interval': options.retryInterval,
    callback: (token) => { window.__token = token; window.__events.push('token'); scheduler.onSuccess(); },
    'error-callback': (code) => { window.__events.push('error ' + code); return scheduler.onError(code); },
    'timeout-callback': () => { window.__events.push('timeout'); scheduler.onTimeout(); },
  });
};
const script = document.createElement('script');
script.src = '${TURNSTILE_SCRIPT_URL}?render=explicit&onload=__ready';
script.async = true;
script.nonce = document.querySelector('meta[name="csp-nonce"]').content;
document.head.appendChild(script);
</script></body></html>`;
}

async function open(page: Page, siteKey: string) {
  await page.route(HARNESS, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: harness(siteKey, withTurnstileCsp(FORMS_POLICY)),
    })
  );
  await page.goto(HARNESS);
}

const read = (page: Page) =>
  page.evaluate(() => ({
    token: (window as unknown as { __token?: string }).__token ?? '',
    events: (window as unknown as { __events: string[] }).__events,
    violations: (window as unknown as { __violations: string[] }).__violations,
  }));

test('delivers a token under the forms CSP without policy violations', async ({
  page,
}) => {
  await open(page, PASS_KEY);
  await expect
    .poll(async () => (await read(page)).token, { timeout: 30_000 })
    .not.toBe('');
  const state = await read(page);
  expect(state.violations).toEqual([]);
  expect(state.events.filter((event) => event === 'reset')).toEqual([]);
});

test('issues a fresh token after a back/forward cache restore', async ({
  page,
}) => {
  await open(page, PASS_KEY);
  await expect
    .poll(async () => (await read(page)).token, { timeout: 30_000 })
    .not.toBe('');
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true })
    );
  });
  await expect
    .poll(
      async () => (await read(page)).events.filter((e) => e === 'token').length,
      {
        timeout: 30_000,
      }
    )
    .toBe(2);
  expect((await read(page)).events).toContain('restore');
});

test('bounds retries for a blocked challenge instead of resetting in a loop', async ({
  page,
}) => {
  await open(page, BLOCK_KEY);
  await expect
    .poll(
      async () => (await read(page)).events.some((e) => e.startsWith('error')),
      {
        timeout: 30_000,
      }
    )
    .toBe(true);
  await page.waitForTimeout(8000);
  const { events, violations } = await read(page);
  expect(
    events.filter((event) => event === 'reset').length
  ).toBeLessThanOrEqual(3);
  expect(events).not.toContain('token');
  expect(violations).toEqual([]);
});

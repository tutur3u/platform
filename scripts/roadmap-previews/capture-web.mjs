#!/usr/bin/env node
// Captures raw Sorbet screenshots of the fixture workspace for the roadmap
// feature previews.
//
//   node scripts/roadmap-previews/capture-web.mjs --raw <dir> --state <seed.json>
//        [--features a,b] [--devices mac,iphone] [--themes light,dark] [--locales en,vi]
//
// Needs the local stack (web, Tasks and Calendar satellites, Supabase) running
// and seeded; see apps/docs/build/devops/roadmap-previews.mdx.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEVICES, LOCALES, THEMES } from './devices.mjs';
import {
  chromium,
  FIXTURE,
  log,
  mountBasePathApi,
  REPO_ROOT,
  satelliteStorageState,
  signIn,
} from './lib.mjs';
import { APPS, SCENES } from './scenes.mjs';

const LOGO = path.join(
  REPO_ROOT,
  'packages/roadmap-core/src/assets/tuturuuu-logo.png'
);

const HIDE_DEV_CHROME = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root], [data-sonner-toaster] { display: none !important; }
`;

function logFailure(id, device, theme, locale, error) {
  const reason = String(error.message).split('\n')[0];
  log('FAILED', id, device, theme, locale, reason);
}

async function storageStateFor(browser, app, state) {
  const { origin, basePath = '' } = APPS[app];
  if (app === 'web' || app === 'meet') {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, FIXTURE.owner.email);
    const ss = await ctx.storageState();
    await ctx.close();
    return ss;
  }
  return satelliteStorageState(
    browser,
    origin,
    `/en/${state.wsId}`,
    FIXTURE.owner.email,
    { verifyPath: `${basePath}/verify-token`, basePath }
  );
}

async function newContext(browser, storage, app, device, theme, locale) {
  const d = DEVICES[device];
  // The handshake stores its own locale cookie; the requested one must win.
  const cookies = storage.cookies.filter((c) => c.name !== 'NEXT_LOCALE');
  const ctx = await browser.newContext({
    storageState: { ...storage, cookies },
    permissions: app === 'meet' ? ['camera', 'microphone'] : [],
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.scale,
    isMobile: Boolean(d.mobile),
    hasTouch: Boolean(d.mobile || d.touch),
    colorScheme: theme,
    locale: locale === 'vi' ? 'vi-VN' : 'en-US',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });
  await ctx.addInitScript(
    ({ theme, locale, css }) => {
      try {
        localStorage.setItem('theme', theme);
        localStorage.setItem('tuturuuu:experimental-sorbet-ui', 'true');
        document.cookie = `NEXT_LOCALE=${locale}; path=/`;
      } catch {}
      const inject = () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.documentElement.appendChild(style);
      };
      if (document.documentElement) inject();
      else document.addEventListener('DOMContentLoaded', inject);
    },
    { theme, locale, css: HIDE_DEV_CHROME }
  );
  await ctx.addCookies([
    { name: 'NEXT_LOCALE', value: locale, domain: 'localhost', path: '/' },
  ]);
  // Monday morning of the current week, so the seeded week reads as upcoming.
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(8, 30, 0, 0);
  await ctx.clock.setFixedTime(monday);
  await ctx.route('https://tuturuuu.com/media/logos/**', (route) =>
    route.fulfill({ path: LOGO })
  );
  await mountBasePathApi(ctx, APPS[app].origin, APPS[app].basePath);
  return ctx;
}

// The dev server's Tailwind breakpoint badge is not part of the product.
async function hideDevBadges(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 2) continue;
      const text = el.textContent?.trim();
      if (!text || !/^(xs|sm|md|lg|xl|2xl)$/.test(text)) continue;
      for (
        let node = el;
        node && node !== document.body;
        node = node.parentElement
      ) {
        if (getComputedStyle(node).position === 'fixed') {
          node.style.display = 'none';
          break;
        }
      }
    }
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      raw: { type: 'string' },
      state: { type: 'string' },
      features: { type: 'string' },
      devices: { type: 'string' },
      themes: { type: 'string' },
      locales: { type: 'string' },
    },
  });
  const state = JSON.parse(fs.readFileSync(values.state, 'utf8'));
  const list = (v, all) => (v ? v.split(',') : all);
  const features = list(
    values.features,
    SCENES.map((s) => s.id)
  );
  const devices = list(values.devices, Object.keys(DEVICES));
  const themes = list(values.themes, THEMES);
  const locales = list(values.locales, LOCALES);
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  const storages = new Map();
  try {
    for (const scene of SCENES.filter((s) => features.includes(s.id))) {
      if (!storages.has(scene.app)) {
        storages.set(
          scene.app,
          await storageStateFor(browser, scene.app, state)
        );
      }
      for (const device of devices.filter(
        (d) => !scene.devices || scene.devices.includes(d)
      )) {
        for (const theme of themes) {
          for (const locale of locales.filter(
            (l) => !scene.locales || scene.locales.includes(l)
          )) {
            const out = path.join(
              values.raw,
              scene.id,
              `${device}-${theme}-${locale}.png`
            );
            if (fs.existsSync(out)) continue;
            fs.mkdirSync(path.dirname(out), { recursive: true });
            let data = null;
            try {
              data = scene.before
                ? await scene.before({ browser, state, locale })
                : null;
            } catch (error) {
              logFailure(scene.id, device, theme, locale, error);
              continue;
            }
            const ctx = await newContext(
              browser,
              storages.get(scene.app),
              scene.app,
              device,
              theme,
              locale
            );
            const page = await ctx.newPage();
            try {
              await page.goto(scene.url({ locale, state, data }), {
                waitUntil: 'domcontentloaded',
                timeout: 300000,
              });
              await scene.prepare(page, { device, locale, theme });
              await page.waitForTimeout(1200);
              await hideDevBadges(page);
              await page.evaluate(() => document.activeElement?.blur?.());
              await page.screenshot({ path: out });
              log('captured', scene.id, device, theme, locale);
            } catch (error) {
              logFailure(scene.id, device, theme, locale, error);
              await page
                .screenshot({ path: `${out}.failed.png` })
                .catch(() => {});
            } finally {
              await ctx.close();
              if (scene.after) {
                const where = [`${scene.id} cleanup`, device, theme, locale];
                await scene.after(data).catch((e) => logFailure(...where, e));
              }
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
}

await main();

// Meet call scenes. A second fixture participant joins first so the call view
// shows a real two-person room; media comes from Chromium's fake devices, with
// cameras off (avatar tiles), so no synthetic video is involved.
import { createMeeting, FIXTURE, MEET, signIn } from './lib.mjs';

async function joinNow(page) {
  const join = page
    .getByRole('button', { name: /^(join now|tham gia ngay)/i })
    .first();
  await join.waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForTimeout(6000);
  await join.click({ noWaitAfter: true, timeout: 120000 });
}

async function joinAsTeammate(browser, state, meetingId, locale) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['camera', 'microphone'],
  });
  const page = await ctx.newPage();
  await signIn(page, FIXTURE.teammate.email);
  await page.goto(`${MEET}/${locale}/r/${meetingId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 300000,
  });
  await joinNow(page);
  await page
    .getByRole('button', { name: /leave|rời/i })
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  return ctx;
}

async function before({ browser, state, locale }) {
  const meetingId = await createMeeting(state);
  const teammate = await joinAsTeammate(browser, state, meetingId, locale);
  return { meetingId, teammate };
}

async function inCall(page) {
  await joinNow(page);
  await page
    .getByText(FIXTURE.teammate.displayName)
    .first()
    .waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForTimeout(7000);
  // The browser's autoplay policy adds a "Play meeting audio" chip in a
  // headless run; it is not part of the call UI being previewed.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if (/play meeting audio|phát âm thanh/i.test(el.textContent ?? '')) {
        el.style.display = 'none';
      }
    }
  });
  await page.waitForTimeout(1500);
}

export const MEET_SCENES = [
  {
    id: 'meet-call',
    app: 'meet',
    before,
    after: async (data) => data.teammate.close(),
    url: ({ locale, data }) => `${MEET}/${locale}/r/${data.meetingId}`,
    prepare: async (page) => inCall(page),
  },
  {
    id: 'meet-assistant',
    app: 'meet',
    before,
    after: async (data) => data.teammate.close(),
    url: ({ locale, data }) => `${MEET}/${locale}/r/${data.meetingId}`,
    prepare: async (page) => {
      await inCall(page);
      await page
        .getByRole('button', { name: /^(chat|trò chuyện)$/i })
        .first()
        .click();
      await page
        .getByRole('tab', {
          name: /private (mira tutor|assistant)|trợ lý riêng/i,
        })
        .first()
        .click();
      await page.waitForTimeout(2000);
    },
  },
];

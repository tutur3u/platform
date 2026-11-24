// Feature scenes: where each preview lives and how to settle the page before
// the raw screenshot. `prepare` runs after navigation and must leave the page
// in its final, populated state.
import { CALENDAR, MEET, TASKS, WEB } from './lib.mjs';
import { MEET_SCENES } from './meet-scenes.mjs';

const taskName = 'Redesign the pricing page';
const firstColumnTask = 'Draft the partner onboarding guide';

async function waitForText(page, text, timeout = 90000) {
  await page.getByText(text).first().waitFor({ state: 'visible', timeout });
}

async function showList(page) {
  await page.keyboard.press('g');
  await page.keyboard.press('l');
  await page.waitForTimeout(1500);
}

export const SCENES = [
  ...MEET_SCENES,
  {
    id: 'tasks-board',
    app: 'tasks',
    url: ({ locale, state }) =>
      `${TASKS}/${locale}/${state.wsId}/boards/${state.boardId}`,
    prepare: async (page) => waitForText(page, firstColumnTask),
  },
  {
    id: 'tasks-list',
    app: 'tasks',
    url: ({ locale, state }) =>
      `${TASKS}/${locale}/${state.wsId}/boards/${state.boardId}`,
    prepare: async (page) => {
      await waitForText(page, taskName);
      await showList(page);
      await waitForText(page, taskName);
    },
  },
  {
    id: 'calendar-week',
    app: 'calendar',
    url: ({ locale, state }) => `${CALENDAR}/calendar/${locale}/${state.wsId}`,
    prepare: async (page) => waitForText(page, 'Design critique'),
  },
  {
    id: 'settings-profile',
    app: 'web',
    url: ({ locale, state }) =>
      `${WEB}/${locale}/${state.wsId}?settingsTab=profile`,
    prepare: async (page) => {
      await page
        .getByRole('dialog')
        .first()
        .waitFor({ state: 'visible', timeout: 90000 });
      await waitForText(page, 'Linh Tran');
      await page.waitForTimeout(1500);
    },
  },
];

// Phone widths open the app navigation over Mira, so only wider devices apply.
SCENES.push({
  id: 'mira-chat',
  devices: ['mac', 'ipad', 'ipad-landscape', 'duo-unfolded'],
  app: 'web',
  url: ({ locale, state }) => `${WEB}/${locale}/${state.wsId}/mira`,
  prepare: async (page) => {
    await page
      .getByRole('textbox')
      .first()
      .waitFor({ state: 'visible', timeout: 90000 });
    await waitForText(page, 'Linh Tran');
    await page.waitForTimeout(2000);
  },
});

export const APPS = {
  tasks: { origin: TASKS },
  calendar: { origin: CALENDAR, basePath: '/calendar' },
  web: { origin: WEB },
  meet: { origin: MEET },
};

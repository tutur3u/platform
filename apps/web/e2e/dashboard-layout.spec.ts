import { expect, type Page, test } from '@playwright/test';
import { DASHBOARD_URL } from './helpers/constants';
import {
  DASHBOARD_VIEWPORTS,
  expectDashboardGeometry,
} from './helpers/dashboard-geometry-probe';

const LONG =
  'Prepare the quarterly launch checklist for every regional marketing team, partner agency and reseller';

function isoToday(hours: number, minutes = 0) {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

/**
 * Deterministic, worst-case content for the client-read cards: long names and
 * every task group. Finance is read on the server, so it renders whatever the
 * seeded workspace returns (data or its error state); both are measured.
 */
async function stubDashboardData(page: Page) {
  const task = (id: string, end: string | null) => ({
    id,
    name: `${LONG} (${id})`,
    end_date: end,
    list: {
      name: 'Launch',
      board: { id: 'board-1', ws_id: 'ws-1', name: `${LONG} board` },
    },
  });
  await page.route('**/api/v1/users/me/tasks**', (route) =>
    route.fulfill({
      json: {
        overdue: [
          task('overdue', new Date(Date.now() - 2 * 864e5).toISOString()),
        ],
        today: [task('today', isoToday(23))],
        upcoming: [task('upcoming', null)],
        completed: [],
      },
    })
  );
  await page.route('**/api/v1/workspaces/*/calendar/events**', (route) =>
    route.fulfill({
      json: {
        data: [0, 9, 14, 21].map((hour) => ({
          id: `event-${hour}`,
          title: `${LONG} sync ${hour}`,
          location: `${LONG} room`,
          start_at: isoToday(hour),
          end_at: isoToday(hour, 45),
          color: 'BLUE',
        })),
        count: 4,
      },
    })
  );
  await page.route('**/time-tracking/sessions?type=running**', (route) =>
    route.fulfill({
      json: {
        session: {
          id: 'session-1',
          title: `${LONG} timer`,
          start_time: new Date(Date.now() - 42 * 60_000).toISOString(),
          is_running: true,
        },
      },
    })
  );
  await page.route('**/time-tracking/sessions?type=stats**', (route) =>
    route.fulfill({
      json: {
        stats: { todayTime: 13_320, weekTime: 76_200, monthTime: 0, streak: 0 },
      },
    })
  );
  await page.route('**/time-tracking/goals', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            goals: [
              {
                id: 'goal-1',
                category_id: null,
                daily_goal_minutes: 360,
                weekly_goal_minutes: null,
                is_active: true,
              },
            ],
          },
        })
      : route.continue()
  );
  await page.route('**/time-tracking/stats/period**', (route) =>
    route.fulfill({
      json: {
        totalDuration: 76_200,
        dailyBreakdown: [0, 1, 2, 3, 4, 5, 6].map((offset) => {
          const day = new Date();
          day.setDate(day.getDate() - offset);
          return {
            date: day.toLocaleDateString('en-CA'),
            totalDuration: 3_600 * (offset + 1),
            breakdown: [],
          };
        }),
      },
    })
  );
}

test.describe('Workspace dashboard layout geometry', () => {
  for (const width of DASHBOARD_VIEWPORTS) {
    test(`cards stay readable and never overlap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await stubDashboardData(page);
      await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

      const layout = page.locator('[data-dashboard-layout]');
      await expect(layout).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('[data-dashboard-block="mira"]').first()).toBeVisible();
      await expect(layout.locator('[data-dashboard-card] [role="status"]')).toHaveCount(0, {
        timeout: 30_000,
      });

      await expectDashboardGeometry(page, 900);
    });
  }
});

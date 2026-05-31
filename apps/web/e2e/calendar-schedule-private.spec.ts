import { expect, test } from '@playwright/test';
import { LOCAL_E2E_BASE_URL } from './helpers/environment';

const SEEDED_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const BASE_URL = process.env.BASE_URL || LOCAL_E2E_BASE_URL;

test.describe('Calendar schedule private metadata API', () => {
  test('reads scheduling metadata through the workspace API', async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/workspaces/${SEEDED_WORKSPACE_ID}/calendar/schedule`,
      { failOnStatusCode: false }
    );

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      lastScheduledAt: string | null;
      lastStatus: string | null;
      lastMessage: string | null;
      statistics: {
        habitsScheduled: number;
        tasksScheduled: number;
        eventsCreated: number;
        bumpedHabits: number;
        windowDays: number;
      };
      schedulableItems: {
        activeHabits: number;
        autoScheduleTasks: number;
      };
      mode: 'personal' | 'workspace';
    };

    expect(body).toHaveProperty('lastScheduledAt');
    expect(body).toHaveProperty('lastStatus');
    expect(body).toHaveProperty('lastMessage');
    expect(body.statistics).toEqual(
      expect.objectContaining({
        habitsScheduled: expect.any(Number),
        tasksScheduled: expect.any(Number),
        eventsCreated: expect.any(Number),
        bumpedHabits: expect.any(Number),
        windowDays: expect.any(Number),
      })
    );
    expect(body.schedulableItems).toEqual(
      expect.objectContaining({
        activeHabits: expect.any(Number),
        autoScheduleTasks: expect.any(Number),
      })
    );
    expect(body.mode).toBe('workspace');
  });

  test('rejects unauthenticated scheduling metadata access', async ({
    playwright,
  }) => {
    const unauthenticated = await playwright.request.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });

    try {
      const response = await unauthenticated.get(
        `/api/v1/workspaces/${SEEDED_WORKSPACE_ID}/calendar/schedule`,
        { failOnStatusCode: false }
      );

      expect([401, 403]).toContain(response.status());
    } finally {
      await unauthenticated.dispose();
    }
  });
});

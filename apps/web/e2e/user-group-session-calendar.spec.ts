import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

function serviceHeaders({
  prefer,
  schema,
}: {
  prefer?: string;
  schema?: 'private' | 'public';
} = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
    ...(schema
      ? {
          'accept-profile': schema,
          'content-profile': schema,
        }
      : {}),
  };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

test.describe('User group session calendar', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('renders overlap collapse and recurring drag scope prompt', async ({
    page,
    request,
  }) => {
    const groupId = randomUUID();
    const seriesId = randomUUID();
    const recurringSessionId = randomUUID();
    const secondSessionId = randomUUID();
    const hiddenSessionId = randomUUID();
    const targetDate = formatDate(
      new Date(getWeekStart(new Date()).getTime() + 2 * 24 * 60 * 60 * 1000)
    );
    const dayOfWeek = new Date(`${targetDate}T00:00:00.000Z`).getUTCDay();

    try {
      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            id: groupId,
            name: 'Calendar overlap E2E',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(groupResponse.status()).toBe(201);

      const seriesResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_session_series`,
        {
          data: {
            days_of_week: [dayOfWeek],
            end_time: '08:05',
            end_timezone: 'Asia/Ho_Chi_Minh',
            group_id: groupId,
            id: seriesId,
            interval_weeks: 1,
            start_date: targetDate,
            start_time: '07:05',
            start_timezone: 'Asia/Ho_Chi_Minh',
            title: 'Recurring overlap',
            until_date: targetDate,
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(seriesResponse.status()).toBe(201);

      const sessionsResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions`,
        {
          data: [
            {
              ends_at: `${targetDate}T01:05:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: recurringSessionId,
              recurrence_instance_date: targetDate,
              series_id: seriesId,
              starts_at: `${targetDate}T00:05:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Recurring overlap',
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              ends_at: `${targetDate}T01:10:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: secondSessionId,
              recurrence_instance_date: null,
              series_id: null,
              starts_at: `${targetDate}T00:10:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Second overlap',
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              ends_at: `${targetDate}T01:15:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: hiddenSessionId,
              recurrence_instance_date: null,
              series_id: null,
              starts_at: `${targetDate}T00:15:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Hidden overlap',
              ws_id: ROOT_WORKSPACE_ID,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(sessionsResponse.status()).toBe(201);

      await page.goto(
        `/${DEFAULT_LOCALE}/${ROOT_WORKSPACE_ID}/users/groups/calendar`,
        {
          waitUntil: 'domcontentloaded',
        }
      );

      await expect(page.getByText('User Group Calendar')).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: 'Calendar overlap E2E' }).click();

      await expect(page.getByText('Recurring overlap')).toBeVisible();
      await expect(page.getByRole('button', { name: '+1 more' })).toBeVisible();

      await page.getByRole('button', { name: '+1 more' }).hover();
      await expect(page.getByText('Hidden overlap')).toBeVisible();

      await page
        .getByTestId(`session-card-${recurringSessionId}`)
        .first()
        .dragTo(page.getByTestId(`session-slot-${targetDate}-07:30`));
      await expect(page.getByRole('dialog')).toContainText(
        'Apply recurring change'
      );
      await expect(
        page.getByRole('button', { name: 'This session only' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'This and future sessions' })
      ).toBeVisible();
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions?group_id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_session_series?id=eq.${seriesId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});

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

  test('renders SmartCalendar overlaps and recurring drag scope prompt', async ({
    page,
    request,
  }) => {
    const groupId = randomUUID();
    const seriesId = randomUUID();
    const recurringSessionId = randomUUID();
    const firstOverlapSessionId = randomUUID();
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
            end_time: '12:05',
            end_timezone: 'Asia/Ho_Chi_Minh',
            group_id: groupId,
            id: seriesId,
            interval_weeks: 1,
            start_date: targetDate,
            start_time: '11:05',
            start_timezone: 'Asia/Ho_Chi_Minh',
            title: 'Draggable recurring',
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
              ends_at: `${targetDate}T05:05:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: recurringSessionId,
              recurrence_instance_date: targetDate,
              series_id: seriesId,
              starts_at: `${targetDate}T04:05:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Draggable recurring',
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              ends_at: `${targetDate}T01:05:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: firstOverlapSessionId,
              recurrence_instance_date: null,
              series_id: null,
              starts_at: `${targetDate}T00:05:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'First overlap',
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

      await expect(
        page.getByTestId(`calendar-event-${recurringSessionId}`)
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByTestId(`calendar-event-${firstOverlapSessionId}`)
      ).toBeVisible();
      await expect(
        page.getByTestId(`calendar-event-${secondSessionId}`)
      ).toBeVisible();
      await expect(
        page.getByTestId(`calendar-event-${hiddenSessionId}`)
      ).toBeVisible();

      const recurringCard = page.getByTestId(
        `calendar-event-${recurringSessionId}`
      );
      const targetCell = page
        .locator(`.calendar-cell[data-date="${targetDate}"][data-hour="12"]`)
        .first();

      await recurringCard.scrollIntoViewIfNeeded();
      const cardBox = await recurringCard.boundingBox();
      const cellBox = await targetCell.boundingBox();
      expect(cardBox).not.toBeNull();
      expect(cellBox).not.toBeNull();

      await page.mouse.move(
        cardBox!.x + cardBox!.width / 2,
        cardBox!.y + cardBox!.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        cellBox!.x + cellBox!.width / 2,
        cellBox!.y + cellBox!.height / 2,
        { steps: 8 }
      );
      await page.waitForTimeout(100);
      await page.mouse.up();
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

  test('auto-reconciles stale recurring metadata in the compact schedule card', async ({
    page,
    request,
  }) => {
    const groupId = randomUUID();
    const seriesId = randomUUID();
    const conflictingSessionId = randomUUID();
    const staleSessionId = randomUUID();
    const targetDate = formatDate(
      new Date(getWeekStart(new Date()).getTime() + 2 * 24 * 60 * 60 * 1000)
    );
    const staleRecurrenceDate = formatDate(
      new Date(
        new Date(`${targetDate}T00:00:00.000Z`).getTime() -
          2 * 24 * 60 * 60 * 1000
      )
    );
    const dayOfWeek = new Date(`${targetDate}T00:00:00.000Z`).getUTCDay();
    const month = targetDate.slice(0, 7);
    const dayLabel = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      weekday: 'short',
      year: 'numeric',
    }).format(new Date(`${targetDate}T00:00:00`));

    try {
      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            id: groupId,
            name: 'Compact reconciliation E2E',
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
            end_time: '16:00',
            end_timezone: 'Asia/Ho_Chi_Minh',
            group_id: groupId,
            id: seriesId,
            interval_weeks: 1,
            start_date: targetDate,
            start_time: '14:00',
            start_timezone: 'Asia/Ho_Chi_Minh',
            title: 'Testing',
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

      const sessionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions`,
        {
          data: [
            {
              ends_at: `${targetDate}T09:00:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: staleSessionId,
              recurrence_instance_date: staleRecurrenceDate,
              series_id: seriesId,
              starts_at: `${targetDate}T07:00:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Testing',
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              ends_at: `${staleRecurrenceDate}T09:00:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: conflictingSessionId,
              recurrence_instance_date: targetDate,
              series_id: seriesId,
              starts_at: `${staleRecurrenceDate}T07:00:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Testing',
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
      expect(sessionResponse.status()).toBe(201);

      await page.goto(
        `/${DEFAULT_LOCALE}/${ROOT_WORKSPACE_ID}/users/groups/${groupId}?month=${month}`,
        {
          waitUntil: 'domcontentloaded',
        }
      );

      await expect(
        page.getByRole('heading', { name: 'Compact reconciliation E2E' })
      ).toBeVisible({
        timeout: 30_000,
      });
      await page
        .getByRole('button', { name: `Open schedule for ${dayLabel}` })
        .click();

      await expect(page.getByText('Testing')).toBeVisible();
      await expect(page.getByText('14:00-16:00')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Add missing session' })
      ).toHaveCount(0);

      const reconciledResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions?id=in.(${staleSessionId},${conflictingSessionId})&select=id,series_id,recurrence_instance_date,source`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(reconciledResponse.status()).toBe(200);
      const reconciledRows = (await reconciledResponse.json()) as {
        id: string;
        recurrence_instance_date: string | null;
        series_id: string | null;
        source: string | null;
      }[];
      expect(reconciledRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: staleSessionId,
            recurrence_instance_date: targetDate,
            series_id: seriesId,
            source: 'series_reconciled',
          }),
          expect.objectContaining({
            id: conflictingSessionId,
            recurrence_instance_date: null,
            series_id: seriesId,
            source: 'series_reconciliation_pending',
          }),
        ])
      );
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

  test('keeps attendance separate for two sessions on the same date', async ({
    page,
    request,
  }) => {
    const groupId = randomUUID();
    const learnerId = randomUUID();
    const morningSessionId = randomUUID();
    const eveningSessionId = randomUUID();
    const targetDate = '2030-04-16';

    try {
      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            id: groupId,
            name: 'Session attendance E2E',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(groupResponse.status()).toBe(201);

      const learnerResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_users`,
        {
          data: {
            display_name: 'Session Attendance Learner',
            id: learnerId,
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(learnerResponse.status()).toBe(201);

      const memberResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups_users`,
        {
          data: {
            group_id: groupId,
            role: 'STUDENT',
            user_id: learnerId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(memberResponse.status()).toBe(201);

      const sessionsResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions`,
        {
          data: [
            {
              ends_at: `${targetDate}T01:00:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: morningSessionId,
              recurrence_instance_date: targetDate,
              starts_at: `${targetDate}T00:00:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Morning attendance',
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              ends_at: `${targetDate}T13:30:00.000Z`,
              end_timezone: 'Asia/Ho_Chi_Minh',
              group_id: groupId,
              id: eveningSessionId,
              recurrence_instance_date: targetDate,
              starts_at: `${targetDate}T12:00:00.000Z`,
              start_timezone: 'Asia/Ho_Chi_Minh',
              title: 'Evening attendance',
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

      const attendanceUrl = `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/user-groups/${groupId}/attendance`;
      const morningSave = await page.request.post(attendanceUrl, {
        data: [
          {
            date: targetDate,
            notes: 'morning',
            session_id: morningSessionId,
            status: 'PRESENT',
            user_id: learnerId,
          },
        ],
        failOnStatusCode: false,
      });
      expect(morningSave.status()).toBe(200);

      const eveningSave = await page.request.post(attendanceUrl, {
        data: [
          {
            date: targetDate,
            notes: 'evening',
            session_id: eveningSessionId,
            status: 'ABSENT',
            user_id: learnerId,
          },
        ],
        failOnStatusCode: false,
      });
      expect(eveningSave.status()).toBe(200);

      const morningCheck = await page.request.get(
        `${attendanceUrl}?date=${targetDate}&sessionId=${morningSessionId}`,
        { failOnStatusCode: false }
      );
      expect(morningCheck.status()).toBe(200);
      await expect(morningCheck.json()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            notes: 'morning',
            session_id: morningSessionId,
            status: 'PRESENT',
            user_id: learnerId,
          }),
        ])
      );

      const eveningCheck = await page.request.get(
        `${attendanceUrl}?date=${targetDate}&sessionId=${eveningSessionId}`,
        { failOnStatusCode: false }
      );
      expect(eveningCheck.status()).toBe(200);
      await expect(eveningCheck.json()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            notes: 'evening',
            session_id: eveningSessionId,
            status: 'ABSENT',
            user_id: learnerId,
          }),
        ])
      );
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/user_group_attendance?group_id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions?group_id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups_users?group_id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_users?id=eq.${learnerId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});

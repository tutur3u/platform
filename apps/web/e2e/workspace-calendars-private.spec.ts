import { expect, test } from '@playwright/test';
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

test.describe
  .skip('Workspace calendars private schema API', () => {
    test.beforeAll(() => {
      assertSafeE2EEnvironment();
    });

    test('manages workspace calendars through the authenticated app API', async ({
      request,
    }) => {
      const calendarName = `Private calendar ${Date.now()}`;
      let calendarId: string | undefined;

      try {
        const listResponse = await request.get(
          `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/calendars`,
          { failOnStatusCode: false }
        );

        expect(listResponse.status()).toBe(200);
        const listBody = (await listResponse.json()) as {
          calendars: { id: string; name: string }[];
          total: number;
        };
        expect(Array.isArray(listBody.calendars)).toBe(true);
        expect(listBody.total).toBe(listBody.calendars.length);

        const createResponse = await request.post(
          `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/calendars`,
          {
            data: {
              description: 'Created through app API after private schema move',
              is_enabled: true,
              name: calendarName,
            },
            failOnStatusCode: false,
          }
        );

        expect(createResponse.status()).toBe(201);
        const createdCalendar = (await createResponse.json()) as {
          calendar_type: string;
          description: string | null;
          id: string;
          is_enabled: boolean;
          is_system: boolean;
          name: string;
          ws_id: string;
        };
        calendarId = createdCalendar.id;

        expect(createdCalendar).toEqual(
          expect.objectContaining({
            calendar_type: 'custom',
            description: 'Created through app API after private schema move',
            is_enabled: true,
            is_system: false,
            name: calendarName,
            ws_id: ROOT_WORKSPACE_ID,
          })
        );

        const updateResponse = await request.patch(
          `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/calendars`,
          {
            data: {
              id: calendarId,
              is_enabled: false,
              name: `${calendarName} updated`,
            },
            failOnStatusCode: false,
          }
        );

        expect(updateResponse.status()).toBe(200);
        const updatedCalendar = (await updateResponse.json()) as {
          id: string;
          is_enabled: boolean;
          name: string;
        };

        expect(updatedCalendar).toEqual(
          expect.objectContaining({
            id: calendarId,
            is_enabled: false,
            name: `${calendarName} updated`,
          })
        );

        const deleteResponse = await request.delete(
          `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/calendars?id=${calendarId}`,
          { failOnStatusCode: false }
        );

        expect(deleteResponse.status()).toBe(200);
        await expect(deleteResponse.json()).resolves.toEqual({ success: true });
      } finally {
        if (calendarId) {
          await request.delete(
            `${SUPABASE_URL}/rest/v1/workspace_calendars?id=eq.${calendarId}`,
            {
              failOnStatusCode: false,
              headers: serviceHeaders({ schema: 'private' }),
            }
          );
        }
      }
    });
  });

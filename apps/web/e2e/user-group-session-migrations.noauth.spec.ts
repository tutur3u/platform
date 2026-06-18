import { randomUUID } from 'node:crypto';
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

test.describe('User group schedule migration endpoints', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('migrates legacy class dates and new Tuturuuu schedule details', async ({
    request,
  }) => {
    const groupId = randomUUID();
    const legacySessionId = randomUUID();
    const newSessionId = randomUUID();
    const seriesId = randomUUID();
    const tagId = randomUUID();

    try {
      const groupResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_user_groups`,
        {
          data: {
            id: groupId,
            name: 'Schedule migration E2E',
            ws_id: ROOT_WORKSPACE_ID,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(groupResponse.status()).toBe(201);

      const legacyResponse = await request.put(
        '/api/v1/infrastructure/migrate/class-sessions',
        {
          data: {
            data: [
              {
                end_timezone: 'Asia/Ho_Chi_Minh',
                ends_at: '2030-02-11T01:00:00.000Z',
                group_id: groupId,
                id: legacySessionId,
                recurrence_instance_date: '2030-02-11',
                source: 'legacy_classes.sessions',
                source_legacy_date: '2030-02-11',
                start_timezone: 'Asia/Ho_Chi_Minh',
                starts_at: '2030-02-11T00:00:00.000Z',
                status: 'scheduled',
                title: 'Legacy class date',
                ws_id: ROOT_WORKSPACE_ID,
              },
            ],
          },
          failOnStatusCode: false,
        }
      );
      expect(legacyResponse.status()).toBe(200);

      const legacyCheck = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions?id=eq.${legacySessionId}&select=starts_at,ends_at,start_timezone,end_timezone,source_legacy_date`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(legacyCheck.status()).toBe(200);
      await expect(legacyCheck.json()).resolves.toEqual([
        {
          end_timezone: 'Asia/Ho_Chi_Minh',
          ends_at: '2030-02-11T01:00:00+00:00',
          source_legacy_date: '2030-02-11',
          start_timezone: 'Asia/Ho_Chi_Minh',
          starts_at: '2030-02-11T00:00:00+00:00',
        },
      ]);

      await expect(
        request
          .put(
            '/api/v1/infrastructure/migrate/workspace-user-group-session-series',
            {
              data: {
                data: [
                  {
                    days_of_week: [2, 4, 6],
                    end_time: '20:30',
                    end_timezone: 'Asia/Ho_Chi_Minh',
                    group_id: groupId,
                    id: seriesId,
                    interval_weeks: 1,
                    start_date: '2030-02-12',
                    start_time: '19:00',
                    start_timezone: 'Asia/Ho_Chi_Minh',
                    title: 'Detailed recurring series',
                    until_date: '2030-03-12',
                    ws_id: ROOT_WORKSPACE_ID,
                  },
                ],
              },
              failOnStatusCode: false,
            }
          )
          .then((response) => response.status())
      ).resolves.toBe(200);

      await expect(
        request
          .put('/api/v1/infrastructure/migrate/workspace-user-group-sessions', {
            data: {
              data: [
                {
                  description: '# Detailed migrated session',
                  end_timezone: 'Asia/Ho_Chi_Minh',
                  ends_at: '2030-02-12T13:30:00.000Z',
                  group_id: groupId,
                  id: newSessionId,
                  recurrence_instance_date: '2030-02-12',
                  series_id: seriesId,
                  start_timezone: 'Asia/Ho_Chi_Minh',
                  starts_at: '2030-02-12T12:00:00.000Z',
                  status: 'scheduled',
                  title: 'Detailed session',
                  ws_id: ROOT_WORKSPACE_ID,
                },
              ],
            },
            failOnStatusCode: false,
          })
          .then((response) => response.status())
      ).resolves.toBe(200);

      await expect(
        request
          .put(
            '/api/v1/infrastructure/migrate/workspace-user-group-session-tags',
            {
              data: {
                data: [
                  {
                    id: tagId,
                    name: 'Migrated tag',
                    ws_id: ROOT_WORKSPACE_ID,
                  },
                ],
              },
              failOnStatusCode: false,
            }
          )
          .then((response) => response.status())
      ).resolves.toBe(200);

      await expect(
        request
          .put(
            '/api/v1/infrastructure/migrate/workspace-user-group-session-tag-links',
            {
              data: {
                data: [
                  {
                    session_id: newSessionId,
                    tag_id: tagId,
                    ws_id: ROOT_WORKSPACE_ID,
                  },
                ],
              },
              failOnStatusCode: false,
            }
          )
          .then((response) => response.status())
      ).resolves.toBe(200);

      await expect(
        request
          .put(
            '/api/v1/infrastructure/migrate/workspace-user-group-session-files',
            {
              data: {
                data: [
                  {
                    id: randomUUID(),
                    name: 'slides.pdf',
                    session_id: newSessionId,
                    storage_path: 'user-groups/migrated/slides.pdf',
                    ws_id: ROOT_WORKSPACE_ID,
                  },
                ],
              },
              failOnStatusCode: false,
            }
          )
          .then((response) => response.status())
      ).resolves.toBe(200);

      const detailedCheck = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_sessions?id=eq.${newSessionId}&select=starts_at,ends_at,start_timezone,end_timezone,description`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      expect(detailedCheck.status()).toBe(200);
      await expect(detailedCheck.json()).resolves.toEqual([
        {
          description: '# Detailed migrated session',
          end_timezone: 'Asia/Ho_Chi_Minh',
          ends_at: '2030-02-12T13:30:00+00:00',
          start_timezone: 'Asia/Ho_Chi_Minh',
          starts_at: '2030-02-12T12:00:00+00:00',
        },
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_session_files?session_id=eq.${newSessionId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_session_tag_links?session_id=eq.${newSessionId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_user_group_session_tags?id=eq.${tagId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ schema: 'private' }),
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

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TEST_USER } from './helpers/constants';
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

function serviceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

test.describe('Recording transcripts private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('writes and reads transcripts through the authenticated app API', async ({
    request,
  }) => {
    const meetingId = randomUUID();
    const sessionId = randomUUID();
    const transcriptText = 'Private recording transcript e2e';

    try {
      const meetingResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_meetings`,
        {
          data: {
            id: meetingId,
            ws_id: ROOT_WORKSPACE_ID,
            name: 'Private transcript E2E meeting',
            creator_id: TEST_USER.id,
            time: new Date().toISOString(),
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(meetingResponse.status()).toBe(201);

      const sessionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/recording_sessions`,
        {
          data: {
            id: sessionId,
            meeting_id: meetingId,
            user_id: TEST_USER.id,
            status: 'pending_transcription',
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );

      expect(sessionResponse.status()).toBe(201);

      const updateResponse = await request.patch(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/meetings/${meetingId}/recordings/${sessionId}`,
        {
          data: {
            status: 'completed',
            transcript: {
              text: transcriptText,
              segments: [{ start: 0, end: 1, text: transcriptText }],
              language: 'en',
              durationInSeconds: 1,
            },
          },
          failOnStatusCode: false,
        }
      );

      expect(updateResponse.status()).toBe(200);
      expect(await updateResponse.json()).toEqual(
        expect.objectContaining({ success: true })
      );

      const listResponse = await request.get(
        `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/meetings/${meetingId}/recordings?limit=5`,
        { failOnStatusCode: false }
      );

      expect(listResponse.status()).toBe(200);

      const body = (await listResponse.json()) as {
        sessions: {
          id: string;
          status: string;
          transcript: {
            duration_in_seconds: number;
            language: string;
            segments: unknown;
            text: string;
          } | null;
        }[];
        success: boolean;
      };
      const session = body.sessions.find((item) => item.id === sessionId);

      expect(body.success).toBe(true);
      expect(session).toEqual(
        expect.objectContaining({
          id: sessionId,
          status: 'completed',
          transcript: expect.objectContaining({
            duration_in_seconds: 1,
            language: 'en',
            text: transcriptText,
          }),
        })
      );
      expect(session?.transcript?.segments).toEqual([
        { start: 0, end: 1, text: transcriptText },
      ]);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/recording_sessions?id=eq.${sessionId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_meetings?id=eq.${meetingId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});

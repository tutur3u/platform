import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/topic-announcement-fake-supabase.test-helper';
import {
  failScheduleSendWithoutRecipients,
  failStaleScheduleClaims,
} from './send-claim';

describe('failScheduleSendWithoutRecipients', () => {
  it('fails a processing schedule session and leaves other rows alone', async () => {
    const sbAdmin = createFakeSupabase({
      topic_announcements: [
        { id: 'a', source_type: 'schedule', status: 'processing', ws_id: 'w' },
        { id: 'b', source_type: 'manual', status: 'processing', ws_id: 'w' },
        { id: 'c', source_type: 'schedule', status: 'sent', ws_id: 'w' },
      ],
    });
    for (const announcementId of ['a', 'b', 'c']) {
      await failScheduleSendWithoutRecipients({
        announcementId,
        sbAdmin,
        wsId: 'w',
      });
    }
    expect(
      sbAdmin.tables.topic_announcements.map(
        (row: { last_error?: string; status: string }) => [
          row.status,
          row.last_error ?? null,
        ]
      )
    ).toEqual([
      ['failed', 'NO_RECIPIENTS'],
      ['processing', null],
      ['sent', null],
    ]);
  });
});

describe('failStaleScheduleClaims', () => {
  it('fails only stale, unscheduled schedule claims', async () => {
    const old = '2026-10-27T00:00:00.000Z';
    const fresh = '2026-10-27T00:20:00.000Z';
    const base = { scheduled_send_at: null, status: 'processing', ws_id: 'w' };
    const sbAdmin = createFakeSupabase({
      topic_announcements: [
        { ...base, id: 'stale', source_type: 'schedule', updated_at: old },
        { ...base, id: 'fresh', source_type: 'schedule', updated_at: fresh },
        {
          ...base,
          id: 'queued-send',
          scheduled_send_at: old,
          source_type: 'schedule',
          updated_at: old,
        },
        { ...base, id: 'manual', source_type: 'manual', updated_at: old },
        {
          ...base,
          id: 'sent',
          source_type: 'schedule',
          status: 'sent',
          updated_at: old,
        },
      ],
    });
    await failStaleScheduleClaims({
      cutoff: '2026-10-27T00:15:00.000Z',
      sbAdmin,
    });
    expect(
      Object.fromEntries(
        sbAdmin.tables.topic_announcements.map(
          (row: { id: string; last_error?: string; status: string }) => [
            row.id,
            `${row.status}:${row.last_error ?? ''}`,
          ]
        )
      )
    ).toEqual({
      fresh: 'processing:',
      manual: 'processing:',
      'queued-send': 'processing:',
      sent: 'sent:',
      stale: 'failed:PROCESSING_TIMEOUT',
    });
  });
});

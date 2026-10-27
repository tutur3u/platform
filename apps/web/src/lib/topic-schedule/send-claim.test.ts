import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/topic-announcement-fake-supabase.test-helper';
import { failScheduleSendWithoutRecipients } from './send-claim';

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

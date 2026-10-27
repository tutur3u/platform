import { describe, expect, it, vi } from 'vitest';
import {
  saveTopicScheduleMonth,
  TopicScheduleSaveRejectedError,
} from './topic-schedule';

const payload = { deleteIds: [], month: '2026-11', sessions: [] };

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
      status,
    })
  );
}

async function rejection(fetchMock: ReturnType<typeof vi.fn>) {
  try {
    await saveTopicScheduleMonth('ws-1', payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
  } catch (error) {
    return error;
  }
  throw new Error('expected the save to be rejected');
}

describe('saveTopicScheduleMonth', () => {
  it('carries the notify outcome of a conflicting save', async () => {
    const notification = {
      failed: false,
      result: {
        failedTeachers: 0,
        notifiedTeachers: 2,
        skippedUnlinkedTeachers: 1,
        unassignedAnnouncements: 0,
      },
    };
    const error = await rejection(
      respond(409, {
        notification,
        rowErrors: [{ code: 'partially_applied', fields: ['gvnn'] }],
      })
    );
    expect(error).toBeInstanceOf(TopicScheduleSaveRejectedError);
    expect(error).toMatchObject({
      conflict: true,
      notification,
      rowErrors: [{ code: 'partially_applied', fields: ['gvnn'] }],
    });
  });

  it('rejects an invalid save without a notification', async () => {
    const error = await rejection(
      respond(400, { rowErrors: [{ code: 'invalid_class', index: 0 }] })
    );
    expect(error).toMatchObject({ conflict: false, notification: null });
  });
});

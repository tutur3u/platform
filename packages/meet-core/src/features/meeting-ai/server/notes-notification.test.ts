import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { notesReadyNotification, notifyNotesReady } from './notes-notification';

const ws = '00000000-0000-4000-8000-0000000000a1';
const meeting = '00000000-0000-4000-8000-0000000000b2';
const session = '00000000-0000-4000-8000-0000000000c3';
const host = '00000000-0000-4000-8000-0000000000d4';
const member = '00000000-0000-4000-8000-0000000000e5';
const outsider = '00000000-0000-4000-8000-0000000000f6';

describe('notes ready notification', () => {
  it('is a link and identifiers only', () => {
    const body = notesReadyNotification({
      wsId: ws,
      meetingId: meeting,
      sessionId: session,
    });
    expect(body.p_data.href).toBe(`/${ws}/meetings/${meeting}`);
    expect(Object.keys(body.p_data).sort()).toEqual([
      'href',
      'kind',
      'meetingId',
      'sessionId',
    ]);
    const text = JSON.stringify(body);
    for (const forbidden of ['summary', 'transcript', 'decision', 'action'])
      expect(text.toLowerCase()).not.toContain(forbidden);
  });

  it('notifies the host and workspace-member readers only, once each', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [{ user_id: host }, { user_id: member }],
              error: null,
            }),
          }),
        }),
      }),
      rpc,
    };
    const sent = await notifyNotesReady(db as never, {
      wsId: ws,
      meetingId: meeting,
      sessionId: session,
      hostId: host,
      readerIds: [member, host, outsider],
    });
    expect(sent).toBe(2);
    expect(rpc.mock.calls.map(([, params]) => params.p_user_id).sort()).toEqual(
      [host, member].sort()
    );
  });
});

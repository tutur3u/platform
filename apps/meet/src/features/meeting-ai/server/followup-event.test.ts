import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/ai/tools/executors/helpers/encryption', () => ({
  encryptEventFieldsForTools: async () => ({
    title: 'encrypted',
    description: 'encrypted',
    location: null,
    is_encrypted: true,
  }),
}));

import { prepareCalendarFollowup } from './followup-event';

it.each([undefined, 'selected-calendar'])(
  'binds the encrypted event to the reviewed enabled calendar: %s',
  async (calendarId) => {
    const calendar = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'primary' } as { id: string } | null,
        error: null,
      }),
    };
    const events = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'event' }, error: null }),
    };
    const privateDb = { from: vi.fn(() => calendar) };
    const db = { schema: vi.fn(() => privateDb), from: vi.fn(() => events) };
    const payload = {
      calendarId,
      location: null,
      title: 'Review',
      description: 'Source',
      start_at: '2026-09-15T02:00:00.000Z',
      end_at: '2026-09-15T03:00:00.000Z',
    };
    const save = await prepareCalendarFollowup(
      db as never,
      'workspace',
      payload
    );
    expect(db.schema).toHaveBeenCalledWith('private');
    expect(calendar.eq).toHaveBeenCalledWith('ws_id', 'workspace');
    expect(calendar.eq).toHaveBeenCalledWith(
      calendarId ? 'id' : 'calendar_type',
      calendarId ?? 'primary'
    );
    expect(calendar.eq).toHaveBeenCalledWith('is_enabled', true);
    expect(events.insert).not.toHaveBeenCalled();
    await expect(save()).resolves.toMatchObject({ success: true });
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ws_id: 'workspace',
        source_calendar_id: 'primary',
        title: 'encrypted',
        is_encrypted: true,
        start_at: payload.start_at,
        end_at: payload.end_at,
      })
    );
    calendar.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      prepareCalendarFollowup(db as never, 'workspace', payload)
    ).rejects.toMatchObject({ status: 503 });
    expect(events.insert).toHaveBeenCalledTimes(1);
  }
);

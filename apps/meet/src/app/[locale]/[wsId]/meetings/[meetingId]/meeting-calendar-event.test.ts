import { describe, expect, it, vi } from 'vitest';
import { loadMeetingCalendarEvent } from './meeting-calendar-event';

describe('loadMeetingCalendarEvent', () => {
  it('skips admin calendar access when permissions are unavailable', async () => {
    const from = vi.fn();

    const result = await loadMeetingCalendarEvent({
      supabase: { from } as never,
      permissions: null,
      wsId: 'workspace-id',
      meetingId: 'meeting-id',
    });

    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('skips admin calendar access when calendar management is denied', async () => {
    const from = vi.fn();

    const result = await loadMeetingCalendarEvent({
      supabase: { from } as never,
      permissions: {
        withoutPermission: vi.fn().mockReturnValue(true),
      } as never,
      wsId: 'workspace-id',
      meetingId: 'meeting-id',
    });

    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('selects the oldest linked event when legacy duplicates exist', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'event-id', start_at: '2026-09-07T10:00:00Z' },
      error: null,
    });
    const limit = vi.fn().mockReturnValue({ maybeSingle });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn();
    eq.mockReturnValue({ eq, order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const result = await loadMeetingCalendarEvent({
      supabase: { from } as never,
      permissions: {
        withoutPermission: vi.fn().mockReturnValue(false),
      } as never,
      wsId: 'workspace-id',
      meetingId: 'meeting-id',
    });

    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(limit).toHaveBeenCalledWith(1);
    expect(result?.id).toBe('event-id');
  });
});

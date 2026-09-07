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
});

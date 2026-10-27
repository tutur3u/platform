import { describe, expect, it, vi } from 'vitest';
import { validateLinkedSession } from '../time-tracking-linked-session';

describe('time tracking linked session', () => {
  it('scopes the lookup to the workspace and requesting user', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
    const client = { from: vi.fn(() => query) };
    const input = {
      client: client as never,
      sessionId: 'session',
      userId: 'user',
      wsId: 'workspace',
    };

    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await validateLinkedSession(input)).toMatchObject({ status: 400 });
    expect(client.from).toHaveBeenCalledWith('time_tracking_sessions');
    expect(query.eq).toHaveBeenCalledWith('id', 'session');
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user');

    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'Unavailable' },
    });
    expect(await validateLinkedSession(input)).toMatchObject({ status: 500 });

    query.maybeSingle.mockResolvedValue({
      data: { id: 'session' },
      error: null,
    });
    expect(await validateLinkedSession(input)).toBeNull();

    client.from.mockClear();
    expect(
      await validateLinkedSession({ ...input, sessionId: null })
    ).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});

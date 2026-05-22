import { describe, expect, it, vi } from 'vitest';
import {
  fetchUserWorkspaceCalendarGoogleTokenForClient,
  WORKSPACE_CALENDAR_GOOGLE_TOKEN_CLIENT_SELECT,
} from './calendar-auth-token';

describe('calendar-auth-token', () => {
  it('does not request OAuth secret columns', () => {
    expect(WORKSPACE_CALENDAR_GOOGLE_TOKEN_CLIENT_SELECT).not.toContain(
      'access_token'
    );
    expect(WORKSPACE_CALENDAR_GOOGLE_TOKEN_CLIENT_SELECT).not.toContain(
      'refresh_token'
    );
  });

  it('scopes token reads to workspace and authenticated user', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqWorkspace = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqWorkspace });
    const from = vi.fn().mockReturnValue({ select });

    await fetchUserWorkspaceCalendarGoogleTokenForClient({ from } as never, {
      wsId: 'ws-1',
      userId: 'user-1',
    });

    expect(from).toHaveBeenCalledWith('calendar_auth_tokens');
    expect(select).toHaveBeenCalledWith(
      WORKSPACE_CALENDAR_GOOGLE_TOKEN_CLIENT_SELECT
    );
    expect(eqWorkspace).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(maybeSingle).toHaveBeenCalledOnce();
  });
});

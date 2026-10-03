import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { refreshOwnedGoogleSourceColor } from './google-source-color-refresh';
import type { ResolvedCalendarSource } from './source-resolver';

const source = {
  provider: 'google',
  connectionId: 'selected',
  externalCalendarId: 'calendar',
} as ResolvedCalendarSource;
describe('verified source color cache refresh', () => {
  it('refreshes only the server-resolved connection in this workspace', async () => {
    const query = Object.assign(Promise.resolve({ error: null }), {
      update: vi.fn(),
      eq: vi.fn(),
    });
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const from = vi.fn().mockReturnValue(query);
    await refreshOwnedGoogleSourceColor({
      sbAdmin: { from } as unknown as TypedSupabaseClient,
      wsId: 'workspace',
      source,
      background: '#D06B64',
    });
    expect(from).toHaveBeenCalledExactlyOnceWith('calendar_connections');
    expect(query.update).toHaveBeenCalledWith({ color: '#d06b64' });
    expect(query.eq.mock.calls).toEqual([
      ['id', 'selected'],
      ['ws_id', 'workspace'],
      ['provider', 'google'],
    ]);
  });
  it('does not change native defaults or accept translucent source colors', async () => {
    const from = vi.fn();
    await refreshOwnedGoogleSourceColor({
      sbAdmin: { from } as unknown as TypedSupabaseClient,
      wsId: 'workspace',
      source: { ...source, provider: 'tuturuuu' } as ResolvedCalendarSource,
      background: '#ffffff',
    });
    await refreshOwnedGoogleSourceColor({
      sbAdmin: { from } as unknown as TypedSupabaseClient,
      wsId: 'workspace',
      source,
      background: '#ffffff80',
    });
    expect(from).not.toHaveBeenCalled();
  });
});

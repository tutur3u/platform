import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  CalendarSettingsError,
  calendarSettingsFailure,
  personalCalendarSettings,
  workspaceCalendarSettings,
} from './calendar-settings-server';

function fixture({
  member = 'MEMBER',
  permission = true,
  error = null as null | { message: string },
} = {}) {
  const row = {
    timezone: null,
    first_day_of_week: null,
    time_format: null,
    energy_profile: null,
    scheduling_settings: null,
  };
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: row, error })),
    maybeSingle: vi.fn(async () => ({
      data: member ? { type: member } : null,
      error,
    })),
  };
  const supabase = {
    from: vi.fn(() => builder),
    rpc: vi.fn(async () => ({ data: permission, error })),
  };
  return {
    builder,
    supabase,
    context: {
      supabase: supabase as unknown as TypedSupabaseClient,
      userId: 'actor',
    },
  };
}
describe('shared calendar settings domain', () => {
  it('projects only typed domain errors into HTTP adapter failures', () => {
    expect(
      calendarSettingsFailure(
        new CalendarSettingsError(403, 'Workspace access denied')
      )
    ).toEqual({ status: 403, message: 'Workspace access denied' });
    expect(calendarSettingsFailure(new Error('database internals'))).toBeNull();
    expect(
      calendarSettingsFailure({ status: 403, message: 'untrusted shape' })
    ).toBeNull();
  });

  it('loads personal defaults scoped to the injected actor', async () => {
    const { context, builder } = fixture();
    expect(await personalCalendarSettings(context, { method: 'GET' })).toEqual({
      timezone: 'auto',
      first_day_of_week: 'auto',
      time_format: 'auto',
    });
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'actor');
  });
  it.each(['invalid/timezone', '+07:00', ''])(
    'rejects invalid timezone %s before writing',
    async (timezone) => {
      const { context, builder } = fixture();
      await expect(
        personalCalendarSettings(context, {
          method: 'PATCH',
          body: { timezone },
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(builder.update).not.toHaveBeenCalled();
    }
  );
  it('validates first day and writes supported personal values', async () => {
    const { context, builder } = fixture();
    await expect(
      personalCalendarSettings(context, {
        method: 'PATCH',
        body: { first_day_of_week: 'friday' },
      })
    ).rejects.toMatchObject({ status: 400 });
    await personalCalendarSettings(context, {
      method: 'PATCH',
      body: {
        timezone: 'Asia/Ho_Chi_Minh',
        first_day_of_week: 'monday',
        time_format: '24h',
      },
    });
    expect(builder.update).toHaveBeenCalledWith({
      timezone: 'Asia/Ho_Chi_Minh',
      first_day_of_week: 'monday',
      time_format: '24h',
    });
  });
  it.each(['', 'GUEST'])(
    'denies non-member workspace access %s',
    async (member) => {
      const { context, supabase } = fixture({ member });
      await expect(
        workspaceCalendarSettings(context, 'workspace', { method: 'GET' })
      ).rejects.toMatchObject({ status: 403 });
      expect(supabase.from).not.toHaveBeenCalledWith('workspaces');
    }
  );
  it.each(['missing-member', 'no-permission'])(
    'authorizes workspace PATCH before reading malformed JSON (%s)',
    async (reason) => {
      const { context } = fixture(
        reason === 'missing-member' ? { member: '' } : { permission: false }
      );
      const readBody = vi.fn(async () => {
        throw new SyntaxError('Malformed JSON');
      });
      await expect(
        workspaceCalendarSettings(context, 'workspace', {
          method: 'PATCH',
          readBody,
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(readBody).not.toHaveBeenCalled();
    }
  );
  it('requires settings permission before workspace mutation', async () => {
    const { context, supabase, builder } = fixture({ permission: false });
    await expect(
      workspaceCalendarSettings(context, 'workspace', {
        method: 'PATCH',
        body: { timezone: 'auto' },
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(supabase.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_user_id: 'actor',
      p_ws_id: 'workspace',
      p_permission: 'manage_workspace_settings',
    });
    expect(builder.update).not.toHaveBeenCalled();
  });
  it('fails closed on membership lookup errors', async () => {
    const { context } = fixture({ error: { message: 'unavailable' } });
    await expect(
      workspaceCalendarSettings(context, 'workspace', { method: 'GET' })
    ).rejects.toMatchObject({ status: 500 });
  });
  it('rejects an empty workspace patch and preserves defaults', async () => {
    const { context } = fixture();
    await expect(
      workspaceCalendarSettings(context, 'workspace', {
        method: 'PATCH',
        body: {},
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await workspaceCalendarSettings(context, 'workspace', { method: 'GET' })
    ).toEqual({
      timezone: 'auto',
      first_day_of_week: 'auto',
      energy_profile: 'morning_person',
      scheduling_settings: { min_buffer: 5, preferred_buffer: 15 },
    });
  });
});

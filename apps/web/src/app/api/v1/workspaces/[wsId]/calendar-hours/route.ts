import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createDefaultHoursSettings,
  defaultWeekTimeRanges,
  type HourType,
  isValidWeekTimeRanges,
  safeParseHourSettings,
} from '@/components/settings/calendar/hour-settings-shared';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const UpdateHoursSchema = z.object({
  type: z.enum(['PERSONAL', 'WORK', 'MEETING']),
  hours: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      timeBlocks: z.array(
        z.object({
          startTime: z.string(),
          endTime: z.string(),
        })
      ),
    })
  ),
});

async function ensureDefaultRows(
  supabase: Parameters<Parameters<typeof withSessionAuth>[0]>[1]['supabase'],
  wsId: string
) {
  const { data, error } = await supabase
    .from('workspace_calendar_hour_settings')
    .select('type, data')
    .eq('ws_id', wsId);

  if (error) {
    throw error;
  }

  const requiredTypes: HourType[] = ['PERSONAL', 'WORK', 'MEETING'];
  const existingTypes = new Set(
    (data ?? []).map((row) => row.type as HourType)
  );
  const missingTypes = requiredTypes.filter((type) => !existingTypes.has(type));

  if (missingTypes.length > 0) {
    const defaults = missingTypes.map((type) => ({
      ws_id: wsId,
      type,
      data: JSON.stringify(structuredClone(defaultWeekTimeRanges)),
    }));

    const { error: insertError } = await supabase
      .from('workspace_calendar_hour_settings')
      .insert(defaults);

    if (insertError) {
      throw insertError;
    }
  }

  return data ?? [];
}

function toHoursSettingsData(
  rows: Array<{ type: string | null; data: unknown }>
) {
  const defaults = createDefaultHoursSettings();

  const personalData = safeParseHourSettings(
    rows.find((row) => row.type === 'PERSONAL')?.data
  );
  const workData = safeParseHourSettings(
    rows.find((row) => row.type === 'WORK')?.data
  );
  const meetingData = safeParseHourSettings(
    rows.find((row) => row.type === 'MEETING')?.data
  );

  return {
    personalHours: isValidWeekTimeRanges(personalData)
      ? personalData
      : defaults.personalHours,
    workHours: isValidWeekTimeRanges(workData) ? workData : defaults.workHours,
    meetingHours: isValidWeekTimeRanges(meetingData)
      ? meetingData
      : defaults.meetingHours,
  };
}

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, { user, supabase }, { wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId);
      const membership = await verifyWorkspaceMembershipType({
        wsId: normalizedWsId,
        userId: user.id,
        supabase: supabase,
      });

      if (membership.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace membership' },
          { status: 500 }
        );
      }

      if (!membership.ok) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      let rows = await ensureDefaultRows(supabase, normalizedWsId);

      if (rows.length === 0) {
        const { data: insertedRows, error } = await supabase
          .from('workspace_calendar_hour_settings')
          .select('type, data')
          .eq('ws_id', normalizedWsId);

        if (error) {
          throw error;
        }

        rows = insertedRows ?? [];
      }

      return NextResponse.json(toHoursSettingsData(rows));
    } catch (error) {
      console.error('Error loading calendar hours:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 30, swr: 30 } }
);

export const PATCH = withSessionAuth<{ wsId: string }>(
  async (request, { supabase }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      if (permissions.withoutPermission('manage_workspace_settings')) {
        return NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      const body = UpdateHoursSchema.safeParse(await request.json());

      if (!body.success || !isValidWeekTimeRanges(body.data.hours)) {
        return NextResponse.json(
          { message: 'Invalid request data' },
          { status: 400 }
        );
      }

      const normalizedWsId = await normalizeWorkspaceId(wsId);
      const { error } = await supabase
        .from('workspace_calendar_hour_settings')
        .upsert(
          {
            ws_id: normalizedWsId,
            type: body.data.type,
            data: JSON.stringify(body.data.hours),
          },
          { onConflict: 'ws_id,type' }
        );

      if (error) {
        throw error;
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating calendar hours:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

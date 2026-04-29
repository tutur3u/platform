import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
import {
  INTERNAL_WORKSPACE_SLUG,
  MAX_SHORT_TEXT_LENGTH,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const calendarSettingsSchema = z.object({
  timezone: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  first_day_of_week: z
    .enum(['auto', 'sunday', 'monday', 'saturday'])
    .optional(),
  energy_profile: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  scheduling_settings: z.record(z.string(), z.any()).optional(),
});

const normalizeWorkspaceId = (wsIdParam: string, userId: string): string => {
  const normalized = wsIdParam.toLowerCase();
  if (normalized === PERSONAL_WORKSPACE_SLUG) return userId;
  if (normalized === INTERNAL_WORKSPACE_SLUG) return ROOT_WORKSPACE_ID;
  return resolveWorkspaceId(wsIdParam);
};

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = normalizeWorkspaceId(wsId, user.id);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Fetch workspace calendar settings
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select(
        'timezone, first_day_of_week, energy_profile, scheduling_settings'
      )
      .eq('id', normalizedWsId)
      .single();

    if (error) {
      console.error('Error fetching workspace calendar settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workspace calendar settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: workspace.timezone || 'auto',
      first_day_of_week: workspace.first_day_of_week || 'auto',
      energy_profile: workspace.energy_profile || 'morning_person',
      scheduling_settings: workspace.scheduling_settings || {
        min_buffer: 5,
        preferred_buffer: 15,
      },
    });
  } catch (error) {
    console.error('Error in workspace calendar settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = normalizeWorkspaceId(wsId, user.id);

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = calendarSettingsSchema.parse(body);

    const updatePayload: TablesUpdate<'workspaces'> = {};
    if (validatedData.timezone !== undefined) {
      updatePayload.timezone = validatedData.timezone;
    }
    if (validatedData.first_day_of_week !== undefined) {
      updatePayload.first_day_of_week = validatedData.first_day_of_week;
    }
    if (validatedData.energy_profile !== undefined) {
      updatePayload.energy_profile = validatedData.energy_profile;
    }
    if (validatedData.scheduling_settings !== undefined) {
      updatePayload.scheduling_settings = validatedData.scheduling_settings;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No calendar settings provided' },
        { status: 400 }
      );
    }

    // Update workspace calendar settings
    const { data, error } = await supabase
      .from('workspaces')
      .update(updatePayload)
      .eq('id', normalizedWsId)
      .select(
        'timezone, first_day_of_week, energy_profile, scheduling_settings'
      )
      .single();

    if (error) {
      console.error('Error updating workspace calendar settings:', error);
      return NextResponse.json(
        { error: 'Failed to update workspace calendar settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: data.timezone || 'auto',
      first_day_of_week: data.first_day_of_week || 'auto',
      energy_profile: data.energy_profile || 'morning_person',
      scheduling_settings: data.scheduling_settings || {
        min_buffer: 5,
        preferred_buffer: 15,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in workspace calendar settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

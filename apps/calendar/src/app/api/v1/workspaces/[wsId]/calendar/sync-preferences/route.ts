import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  getCalendarSyncPreferences,
  isMissingCalendarSyncSchemaError,
  saveCalendarSyncPreferences,
} from '@/lib/calendar/sync-preferences';

const patchSchema = z.object({
  inboundSyncEnabled: z.boolean().optional(),
  outboundSyncEnabled: z.boolean().optional(),
  conflictPolicy: z.literal('latest_write_wins').optional(),
  defaultOutboundConnectionId: z.guid().nullable().optional(),
});

type Params = {
  params: Promise<{
    wsId: string;
  }>;
};

async function authorize(request: Request, rawWsId: string) {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'calendar' },
  });

  if (!auth.ok) return { error: auth.response };

  const wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: auth.user.id,
    supabase: auth.supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return {
    sbAdmin: await createAdminClient(),
    userId: auth.user.id,
    wsId,
  };
}

export async function GET(request: Request, { params }: Params) {
  const access = await authorize(request, (await params).wsId);
  if ('error' in access) return access.error;

  try {
    return NextResponse.json(
      await getCalendarSyncPreferences({
        sbAdmin: access.sbAdmin,
        wsId: access.wsId,
        userId: access.userId,
      })
    );
  } catch (error) {
    console.error('Failed to load calendar sync preferences', {
      wsId: access.wsId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to load calendar sync preferences' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const access = await authorize(request, (await params).wsId);
  if ('error' in access) return access.error;

  try {
    const body = await request.json();
    const validation = patchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await saveCalendarSyncPreferences({
        sbAdmin: access.sbAdmin,
        wsId: access.wsId,
        userId: access.userId,
        preferences: validation.data,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('unavailable or read-only') ||
      isMissingCalendarSyncSchemaError(error)
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Failed to update calendar sync preferences', {
      wsId: access.wsId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to update calendar sync preferences' },
      { status: 500 }
    );
  }
}

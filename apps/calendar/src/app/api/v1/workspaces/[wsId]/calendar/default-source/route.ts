import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  getDefaultCalendarSource,
  saveDefaultCalendarSource,
} from '@/lib/calendar/source-resolver';

const sourceSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('tuturuuu'),
    workspaceCalendarId: z.guid().optional().nullable(),
  }),
  z.object({
    provider: z.literal('google'),
    connectionId: z.guid(),
  }),
  z.object({
    provider: z.literal('microsoft'),
    connectionId: z.guid(),
  }),
]);

const patchSchema = z.object({
  source: sourceSchema,
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
      await getDefaultCalendarSource({
        sbAdmin: access.sbAdmin,
        wsId: access.wsId,
        userId: access.userId,
      })
    );
  } catch (error) {
    console.error('Failed to load calendar default source', {
      wsId: access.wsId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to load calendar default source' },
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
      await saveDefaultCalendarSource({
        sbAdmin: access.sbAdmin,
        wsId: access.wsId,
        userId: access.userId,
        source: validation.data.source,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('unavailable or read-only')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Failed to update calendar default source', {
      wsId: access.wsId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to update calendar default source' },
      { status: 500 }
    );
  }
}

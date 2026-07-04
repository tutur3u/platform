import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';

const TASKS_USER_WORKSPACE_CONFIG_APP_SESSION_AUTH = {
  targetApp: 'tasks',
} as const;

const userWorkspaceConfigBodySchema = z.object({
  value: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable(),
});

async function resolveWorkspaceConfigAccess({
  rawWsId,
  supabase,
  user,
}: SessionAuthContext & {
  rawWsId: string;
}) {
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const memberCheck = await verifyWorkspaceMembershipType({
    supabase,
    userId: user.id,
    wsId,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      response: NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      ),
      wsId,
    };
  }

  if (!memberCheck.ok) {
    return {
      response: NextResponse.json(
        { message: 'Workspace access denied' },
        { status: 403 }
      ),
      wsId,
    };
  }

  return { response: null, wsId };
}

async function parseUserWorkspaceConfigBody(req: Request) {
  try {
    const body = await req.json();
    const parsedBody = userWorkspaceConfigBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    return parsedBody.data;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
}

export const GET = withSessionAuth<{ wsId: string; configId: string }>(
  async (_req, { user, supabase }, { wsId: rawWsId, configId }) => {
    const access = await resolveWorkspaceConfigAccess({
      rawWsId,
      supabase,
      user,
    });

    if (access.response) {
      return access.response;
    }

    const { data, error } = await supabase
      .from('user_workspace_configs')
      .select('value')
      .eq('user_id', user.id)
      .eq('ws_id', access.wsId)
      .eq('id', configId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching tasks user workspace config:', error);
      return NextResponse.json(
        { message: 'Error fetching user workspace config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ value: data?.value ?? null });
  },
  {
    allowAppSessionAuth: TASKS_USER_WORKSPACE_CONFIG_APP_SESSION_AUTH,
    cache: { maxAge: 60, swr: 30 },
  }
);

export const PUT = withSessionAuth<{ wsId: string; configId: string }>(
  async (req, { user, supabase }, { wsId: rawWsId, configId }) => {
    const access = await resolveWorkspaceConfigAccess({
      rawWsId,
      supabase,
      user,
    });

    if (access.response) {
      return access.response;
    }

    const parsedBody = await parseUserWorkspaceConfigBody(req);

    if (parsedBody instanceof NextResponse) {
      return parsedBody;
    }

    const { value } = parsedBody;

    if (value === null || value === '') {
      const { error } = await supabase
        .from('user_workspace_configs')
        .delete()
        .eq('user_id', user.id)
        .eq('ws_id', access.wsId)
        .eq('id', configId);

      if (error) {
        console.error('Error deleting tasks user workspace config:', error);
        return NextResponse.json(
          { message: 'Error deleting user workspace config' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'success' });
    }

    const { error } = await supabase.from('user_workspace_configs').upsert(
      {
        id: configId,
        user_id: user.id,
        value,
        ws_id: access.wsId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,ws_id,id' }
    );

    if (error) {
      console.error('Error upserting tasks user workspace config:', error);
      return NextResponse.json(
        { message: 'Error upserting user workspace config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: TASKS_USER_WORKSPACE_CONFIG_APP_SESSION_AUTH }
);

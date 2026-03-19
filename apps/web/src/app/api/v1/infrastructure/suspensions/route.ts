import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { suspendUser } from '@tuturuuu/utils/abuse-protection/user-suspension';
import {
  MAX_SEARCH_LENGTH,
  ROOT_WORKSPACE_ID,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth(
  async (_req, { user, supabase }) => {
    const { data: hasPermission } = await supabase.rpc(
      'has_workspace_permission',
      {
        p_ws_id: ROOT_WORKSPACE_ID,
        p_user_id: user.id,
        p_permission: 'manage_workspace_roles',
      }
    );

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin
      .from('user_suspensions')
      .select('*')
      .is('lifted_at', null)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('suspended_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch suspensions' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  },
  { cache: { maxAge: 10, swr: 10 } }
);

const SuspendSchema = z.object({
  userId: z.uuid(),
  reason: z.string().min(1).max(MAX_SEARCH_LENGTH),
  expiresAt: z.string().datetime().optional(),
});

export const POST = withSessionAuth(
  async (req, { user, supabase }) => {
    const { data: hasPermission } = await supabase.rpc(
      'has_workspace_permission',
      {
        p_ws_id: ROOT_WORKSPACE_ID,
        p_user_id: user.id,
        p_permission: 'manage_workspace_roles',
      }
    );

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
      const body = await req.json();
      const { userId, reason, expiresAt } = SuspendSchema.parse(body);

      const success = await suspendUser(
        userId,
        reason,
        user.id,
        expiresAt ? new Date(expiresAt) : undefined
      );

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to suspend user' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'User suspended' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request', details: error.issues },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  // Admin suspension action — strict limit
  { rateLimit: { windowMs: 60000, maxRequests: 10 } }
);

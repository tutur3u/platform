import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

async function requireRootAdmin() {
  const supabase = await createClient();
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const member = await verifyWorkspaceMembershipType({
    wsId: ROOT_WORKSPACE_ID,
    userId: user.id,
    supabase,
  });

  if (member.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!member.ok) {
    return {
      error: NextResponse.json(
        { error: 'Root workspace admin required' },
        { status: 403 }
      ),
    };
  }

  return { user };
}

export async function GET() {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin
      .from('ai_credit_feature_access')
      .select('*')
      .order('tier')
      .order('feature');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch feature access' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in features GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  id: z.guid(),
  enabled: z.boolean().optional(),
  max_requests_per_day: z.number().nullable().optional(),
});

export async function PUT(req: Request) {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('ai_credit_feature_access')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update feature access' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in features PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

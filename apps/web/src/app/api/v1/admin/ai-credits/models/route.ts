import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH, ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
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

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get('limit') ?? 50))
    );
    const provider = searchParams.get('provider');
    const enabled = searchParams.get('enabled');

    const sbAdmin = await createAdminClient();
    let query = sbAdmin
      .from('ai_gateway_models')
      .select('*', { count: 'exact' });

    if (provider) {
      query = query.eq('provider', provider);
    }
    if (enabled === 'true') {
      query = query.eq('is_enabled', true);
    } else if (enabled === 'false') {
      query = query.eq('is_enabled', false);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('provider')
      .order('name')
      .range(from, to);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch models' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (error) {
    console.error('Error in models GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  id: z.string().max(MAX_NAME_LENGTH),
  is_enabled: z.boolean(),
});

export async function PATCH(req: Request) {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    if (!parsed.data.is_enabled) {
      const { data: allocationReference, error: allocationReferenceError } =
        await sbAdmin
          .from('ai_credit_plan_allocations')
          .select('tier')
          .or(
            `default_language_model.eq.${parsed.data.id},default_image_model.eq.${parsed.data.id}`
          )
          .limit(1)
          .maybeSingle();

      if (allocationReferenceError) {
        return NextResponse.json(
          { error: 'Failed to validate model usage' },
          { status: 500 }
        );
      }

      if (allocationReference?.tier) {
        return NextResponse.json(
          {
            error: `Cannot disable ${parsed.data.id} because it is configured as a default model for the ${allocationReference.tier} plan.`,
          },
          { status: 409 }
        );
      }
    }

    const { data, error } = await sbAdmin
      .from('ai_gateway_models')
      .update({ is_enabled: parsed.data.is_enabled })
      .eq('id', parsed.data.id)
      .select()
      .single();

    if (error) {
      if (error.message.includes('default model')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json(
        { error: 'Failed to update model' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in models PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

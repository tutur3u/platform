import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

async function requireRootAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .single();

  if (memberError) {
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
  id: z.string(),
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
    const { data, error } = await sbAdmin
      .from('ai_gateway_models')
      .update({ is_enabled: parsed.data.is_enabled })
      .eq('id', parsed.data.id)
      .select()
      .single();

    if (error) {
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

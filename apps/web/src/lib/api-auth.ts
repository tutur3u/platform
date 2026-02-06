import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { type NextRequest, NextResponse } from 'next/server';

type AuthorizedRequest = {
  user: SupabaseUser;
  supabase: TypedSupabaseClient;
};

export async function authorizeRequest(
  request: Pick<NextRequest, 'headers'>
): Promise<{ data: AuthorizedRequest | null; error: NextResponse | null }> {
  const authHeader =
    request.headers.get('authorization') ??
    request.headers.get('Authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : undefined;

  let supabase = (await createClient()) as TypedSupabaseClient;
  let user: SupabaseUser | null = null;

  if (accessToken) {
    const adminClient = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;
    const {
      data: { user: tokenUser },
      error: tokenError,
    } = await adminClient.auth.getUser(accessToken);

    if (tokenError || !tokenUser) {
      return {
        data: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }

    user = tokenUser;
    supabase = adminClient;
  } else {
    const {
      data: { user: cookieUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !cookieUser) {
      return {
        data: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }

    user = cookieUser;
  }

  if (!user) {
    return {
      data: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { data: { user, supabase }, error: null };
}

export async function authorize(
  wsId: string
): Promise<{ user: SupabaseUser | null; error: NextResponse | null }> {
  const supabase = (await createClient()) as TypedSupabaseClient;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: memberCheck, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (memberError) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      ),
    };
  }
  return { user, error: null };
}

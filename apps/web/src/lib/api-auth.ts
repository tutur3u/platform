import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { type NextRequest, NextResponse } from 'next/server';

export type AuthorizedRequest = {
  user: SupabaseUser;
  supabase: TypedSupabaseClient;
};

export async function authorizeRequest(
  request: Pick<NextRequest, 'headers'>
): Promise<{ data: AuthorizedRequest | null; error: NextResponse | null }> {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
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

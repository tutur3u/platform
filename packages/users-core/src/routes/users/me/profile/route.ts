import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { resolveUserGroupAppSessionUser } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { unstable_rethrow } from 'next/navigation';
import { connection, NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    await connection();
    const appSessionUser = resolveUserGroupAppSessionUser(request);
    const user = appSessionUser
      ? appSessionUser
      : (await resolveAuthenticatedSessionUser(await createClient(request)))
          .user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createAdminClient({ noCookie: true });
    const [
      { data: profile, error: profileError },
      { data: privateDetails, error: privateError },
    ] = await Promise.all([
      admin
        .from('users')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', user.id)
        .maybeSingle(),
      admin
        .from('user_private_details')
        .select('full_name, new_email, email, default_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    if (profileError || privateError) throw profileError || privateError;

    return NextResponse.json({
      avatar_url: profile?.avatar_url ?? null,
      created_at: profile?.created_at ?? user.created_at ?? null,
      default_workspace_id: privateDetails?.default_workspace_id ?? null,
      display_name: profile?.display_name ?? null,
      email: privateDetails?.email ?? null,
      full_name: privateDetails?.full_name ?? null,
      id: profile?.id ?? user.id,
      new_email: privateDetails?.new_email ?? null,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching Contacts current-user profile', { error });
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

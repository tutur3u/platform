import {
  type CurrentUserReadContext,
  type SectionOutcome,
  timeDb,
} from './context';

/** Body of `GET /api/v1/users/me/profile`. */
export async function readCurrentUserProfile(
  ctx: CurrentUserReadContext
): Promise<SectionOutcome> {
  const { supabase, user } = ctx;
  let { data: userData, error: userError } = await timeDb(ctx, () =>
    supabase
      .from('users')
      .select(
        'id, display_name, avatar_url, banner_url, bio, handle, created_at'
      )
      .eq('id', user.id)
      .maybeSingle()
  );

  if (userError && ['42703', 'PGRST204'].includes(userError.code)) {
    const legacy = await timeDb(ctx, () =>
      supabase
        .from('users')
        .select('id,display_name,avatar_url,bio,handle,created_at')
        .eq('id', user.id)
        .maybeSingle()
    );
    userData = legacy.data ? { ...legacy.data, banner_url: null } : null;
    userError = legacy.error;
  }
  if (userError) {
    return {
      body: { message: 'Error fetching user profile' },
      log: ['Error fetching user profile:', { code: userError.code }],
      status: 500,
    };
  }

  const { data: privateData, error: privateError } = await timeDb(ctx, () =>
    supabase
      .from('user_private_details')
      .select('full_name, new_email, email, default_workspace_id')
      .eq('user_id', user.id)
      .maybeSingle()
  );

  if (privateError) {
    return {
      body: { message: 'Error fetching user profile' },
      log: [
        'Error fetching user private profile details:',
        { error: privateError.message, userId: user.id },
      ],
      status: 500,
    };
  }

  return {
    body: {
      id: userData?.id ?? user.id,
      email: privateData?.email ?? null,
      display_name: userData?.display_name ?? null,
      avatar_url: userData?.avatar_url ?? null,
      banner_url: userData?.banner_url ?? null,
      bio: userData?.bio ?? null,
      handle: userData?.handle ?? null,
      full_name: privateData?.full_name ?? null,
      new_email: privateData?.new_email ?? null,
      created_at: userData?.created_at ?? user.created_at ?? null,
      default_workspace_id: privateData?.default_workspace_id ?? null,
    },
    status: 200,
  };
}

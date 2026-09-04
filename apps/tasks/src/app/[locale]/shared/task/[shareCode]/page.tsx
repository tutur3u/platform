import { createClient } from '@tuturuuu/supabase/next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { SharedTaskResponse } from '@/app/api/v1/shared/tasks/[shareCode]/response';
import { API_URL } from '@/constants/common';
import { resolveAuthenticatedSessionUser } from '@/lib/app-session-user';
import SharedTaskContent from './content';

interface PageProps {
  params: Promise<{
    shareCode: string;
  }>;
}

export default async function SharedTaskPage({ params }: PageProps) {
  await connection();
  const { shareCode } = await params;

  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    // Redirect to login with return URL
    redirect(`/login?nextUrl=/shared/task/${shareCode}`);
  }

  // Fetch user profile for TaskEditDialog
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('id', user.id)
    .single();

  const { data: userEmail } = await supabase
    .from('user_private_details')
    .select('email')
    .eq('user_id', user.id)
    .single();

  // Fetch shared task data with all workspace context
  const cookieStore = await cookies();
  const res = await fetch(`${API_URL}/v1/shared/tasks/${shareCode}`, {
    headers: {
      cookie: cookieStore.toString(),
    },
  });

  if (!res.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 font-semibold text-2xl text-dynamic-red">
            Share link not found
          </h1>
          <p className="text-muted-foreground">
            This share link may have been revoked or doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  let data: SharedTaskResponse;
  try {
    data = (await res.json()) as SharedTaskResponse;
  } catch (error) {
    console.error('Failed to parse shared task data:', error);
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 font-semibold text-2xl text-dynamic-red">
            Error loading task
          </h1>
          <p className="text-muted-foreground">
            Failed to load task data. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SharedTaskContent
      response={data}
      shareCode={shareCode}
      currentUser={{
        id: userProfile?.id || user.id,
        display_name: userProfile?.display_name ?? undefined,
        avatar_url: userProfile?.avatar_url ?? undefined,
        email: userEmail?.email ?? undefined,
      }}
    />
  );
}

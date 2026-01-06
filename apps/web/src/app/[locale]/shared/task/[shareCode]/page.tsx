import { createClient } from '@tuturuuu/supabase/next/server';
import { API_URL } from '@/constants/common';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import SharedTaskContent from './content';

interface PageProps {
  params: Promise<{
    shareCode: string;
  }>;
}

export default async function SharedTaskPage({ params }: PageProps) {
  const { shareCode } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to login with return URL
    redirect(`/login?next=/shared/task/${shareCode}`);
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

  const data = await res.json();

  return (
    <SharedTaskContent
      task={data.task}
      permission={data.permission}
      workspace={data.workspace}
      board={data.board}
      list={data.list}
      shareCode={shareCode}
      currentUser={{
        id: userProfile?.id || user.id,
        display_name: userProfile?.display_name ?? undefined,
        avatar_url: userProfile?.avatar_url ?? undefined,
        email: userEmail?.email ?? undefined,
      }}
      boardConfig={data.boardConfig}
      availableLists={data.availableLists}
      workspaceLabels={data.workspaceLabels}
      workspaceProjects={data.workspaceProjects}
      workspaceMembers={data.workspaceMembers}
    />
  );
}

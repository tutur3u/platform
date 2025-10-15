import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import JoinWorkspaceClient from './join-workspace-client';

interface Props {
  params: Promise<{
    code: string;
  }>;
}

export default async function InviteCodePage({ params }: Props) {
  const { code } = await params;
  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not authenticated, redirect to login with return URL
  if (!user) {
    const encodedCode = encodeURIComponent(code);
    redirect(`/login?redirect=/invite/${encodedCode}`);
  }

  // Check if user is already a member of the workspace
  const { data: inviteLink } = await supabase
    .from('workspace_invite_links')
    .select('ws_id, workspaces:ws_id(id, name, avatar_url, logo_url)')
    .eq('code', code)
    .single();

  if (inviteLink) {
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', inviteLink.ws_id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      // User is already a member
      return (
        <JoinWorkspaceClient
          code={code}
          workspaceInfo={null}
          alreadyMember={true}
          workspace={inviteLink.workspaces as any}
        />
      );
    }
  }

  // Fetch workspace info using the invite code
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_VERCEL_URL ? 'https://' + process.env.NEXT_PUBLIC_VERCEL_URL : 'http://localhost:7803'}/api/invite/${code}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const error = await response.json();
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-8">
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-6 text-center">
            <h1 className="mb-2 font-bold text-2xl text-dynamic-red">
              Invalid Invite
            </h1>
            <p className="text-foreground/80">
              {error.error || 'This invite link is invalid or has expired.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const workspaceInfo = await response.json();

  return (
    <JoinWorkspaceClient
      code={code}
      workspaceInfo={workspaceInfo}
      alreadyMember={false}
    />
  );
}

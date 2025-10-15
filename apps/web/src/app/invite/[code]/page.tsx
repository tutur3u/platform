import { validateInvite } from '@/lib/invite/validate-invite';
import { redirect } from 'next/navigation';
import JoinWorkspaceClient from './join-workspace-client';

interface Props {
  params: Promise<{
    code: string;
  }>;
}

export default async function InviteCodePage({ params }: Props) {
  const { code } = await params;

  // Validate invite using shared utility
  const result = await validateInvite(code);

  // If not authenticated, redirect to login with return URL
  if (!result.authenticated) {
    const encodedCode = encodeURIComponent(code);
    redirect(`/login?redirect=/invite/${encodedCode}`);
  }

  // If user is already a member, show the already-member view
  if (result.alreadyMember && result.workspace) {
    return (
      <JoinWorkspaceClient
        code={code}
        workspaceInfo={null}
        alreadyMember={true}
        workspace={result.workspace}
      />
    );
  }

  // If there's an error, show error UI
  if (result.error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-8">
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-6 text-center">
            <h1 className="mb-2 font-bold text-2xl text-dynamic-red">
              Invalid Invite
            </h1>
            <p className="text-foreground/80">
              {result.error || 'This invite link is invalid or has expired.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If we have workspace info, show the join view
  if (result.workspaceInfo) {
    return (
      <JoinWorkspaceClient
        code={code}
        workspaceInfo={result.workspaceInfo}
        alreadyMember={false}
      />
    );
  }

  // Fallback error case
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4 p-8">
        <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-6 text-center">
          <h1 className="mb-2 font-bold text-2xl text-dynamic-red">
            Invalid Invite
          </h1>
          <p className="text-foreground/80">
            This invite link is invalid or has expired.
          </p>
        </div>
      </div>
    </div>
  );
}

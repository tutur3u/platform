import { createClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('invite');

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not authenticated, redirect to login with return URL
  if (!user) {
    const encodedCode = encodeURIComponent(code);
    redirect(`/login?nextUrl=/invite/${encodedCode}`);
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

  // Validate invite link using API
  const baseUrl = DEV_MODE ? `http://localhost:7803` : 'https://tuturuuu.com';

  const response = await fetch(`${baseUrl}/api/invite/${code}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();

    // Map error codes to translation keys
    const errorCodeMap: Record<string, string> = {
      INVITE_CODE_REQUIRED: 'error-invite-code-required',
      INVITE_INVALID_OR_EXPIRED: 'error-invite-invalid-or-expired',
      INVITE_EXPIRED: 'error-invite-expired',
      INVITE_MAX_USES_REACHED: 'error-invite-max-uses-reached',
      INVITE_INVALID_WORKSPACE: 'error-invite-invalid-workspace',
      INTERNAL_ERROR: 'error-internal',
      UNAUTHORIZED: 'error-unauthorized',
    };

    const errorMessage =
      error.errorCode && errorCodeMap[error.errorCode]
        ? t(errorCodeMap[error.errorCode as any] as any)
        : t('invalid-invite-message');

    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-8">
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-6 text-center">
            <h1 className="mb-2 font-bold text-2xl text-dynamic-red">
              {t('invalid-invite-title')}
            </h1>
            <p className="text-foreground/80">{errorMessage}</p>
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

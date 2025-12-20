import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { validateInvite } from '@/lib/invite/validate-invite';
import JoinWorkspaceClient from './join-workspace-client';

interface Props {
  params: Promise<{
    code: string;
  }>;
}

export default async function InviteCodePage({ params }: Props) {
  const { code } = await params;
  const t = await getTranslations('invite');

  // Validate invite using shared utility
  const result = await validateInvite(code);

  // If not authenticated, redirect to login with return URL
  if (!result.authenticated) {
    const encodedCode = encodeURIComponent(code);
    redirect(`/login?nextUrl=/invite/${encodedCode}`);
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
    // Map error codes to translation keys
    const errorCodeMap: Record<string, string> = {
      INVITE_CODE_REQUIRED: 'error-invite-code-required',
      INVITE_INVALID_OR_EXPIRED: 'error-invite-invalid-or-expired',
      INVITE_EXPIRED: 'error-invite-expired',
      INVITE_MAX_USES_REACHED: 'error-invite-max-uses-reached',
      INVITE_INVALID_WORKSPACE: 'error-invite-invalid-workspace',
      INTERNAL_ERROR: 'error-internal',
      UNAUTHORIZED: 'error-unauthorized',
      NETWORK_ERROR: 'error-network',
    };

    const errorMessage =
      result.errorCode && errorCodeMap[result.errorCode]
        ? t(errorCodeMap[result.errorCode as keyof typeof errorCodeMap] as any)
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
            {t('invalid-invite-title')}
          </h1>
          <p className="text-foreground/80">{t('invalid-invite-message')}</p>
        </div>
      </div>
    </div>
  );
}

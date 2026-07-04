import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Info,
  ShieldAlert,
  Trash2,
} from '@tuturuuu/icons/lucide';
import {
  deleteCurrentUserAccount,
  getCurrentUserAccountDeletePrecheck,
  InternalApiError,
  logoutBrowserSessionWithInternalApi,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TuturuuLogo,
} from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

type DeleteAccountErrorCode =
  | 'BLOCKED_BY_SUBSCRIPTIONS'
  | 'DELETE_FAILED'
  | 'EMAIL_MISMATCH';

export const Route = createFileRoute('/$locale/account/delete')({
  component: DeleteAccountRoute,
  head: ({ params }) =>
    createPageHead({
      description: 'Delete your Tuturuuu account.',
      locale: resolveMessagesLocale(params.locale),
      title: 'Delete Account',
    }),
  loader: async ({ params }) => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: '/account/delete',
    });
  },
});

function toDeleteAccountErrorCode(error: unknown): DeleteAccountErrorCode {
  if (error instanceof InternalApiError) {
    if (error.status === 409) {
      return 'BLOCKED_BY_SUBSCRIPTIONS';
    }

    if (
      error.status === 400 &&
      error.message.toLowerCase().includes('does not match')
    ) {
      return 'EMAIL_MISMATCH';
    }
  }

  return 'DELETE_FAILED';
}

function DeleteAccountRoute() {
  const { locale } = Route.useParams();
  const t = useTranslations('settings-account');
  const [email, setEmail] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const loginHref = `/${locale}/login`;

  const {
    data: preCheck,
    isError: preCheckError,
    isLoading: preCheckLoading,
  } = useQuery({
    queryFn: () => getCurrentUserAccountDeletePrecheck(),
    queryKey: ['account-delete-precheck'],
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (confirmEmail: string) =>
      deleteCurrentUserAccount({ email: confirmEmail }),
    onError: (error) => {
      const code = toDeleteAccountErrorCode(error);

      if (code === 'BLOCKED_BY_SUBSCRIPTIONS') {
        toast.error(t('delete-account-blocked-by-subscriptions'));
      } else if (code === 'EMAIL_MISMATCH') {
        toast.error(t('delete-account-email-mismatch'));
      } else {
        toast.error(t('delete-account-error'));
      }
    },
    onSuccess: async () => {
      toast.success(t('delete-account-success'));
      setRedirecting(true);
      await logoutBrowserSessionWithInternalApi().catch(() => undefined);
      window.location.assign(loginHref);
    },
  });

  const deleting = deleteMutation.isPending || redirecting;
  const isBlocked = preCheck?.canDelete === false;
  const hasCleanupWork =
    preCheck &&
    (preCheck.cleanupSummary.workspacesToDelete > 0 ||
      preCheck.cleanupSummary.seatsToRevoke > 0);

  const handleDelete = () => {
    const confirmEmail = email.trim();

    if (!confirmEmail) {
      return;
    }

    deleteMutation.mutate(confirmEmail);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="fixed inset-0 bg-linear-to-br from-background via-dynamic-red/5 to-dynamic-orange/10" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <TuturuuLogo height={80} src={TUTURUUU_LOCAL_LOGO_URL} width={80} />
          </div>

          <Card className="border-dynamic-red/20 bg-card/80 shadow-2xl backdrop-blur-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-dynamic-red text-xl">
                {t('delete-account-page-title')}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {t('delete-account-warning')}
              </p>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {preCheckLoading && (
                <div className="flex items-center justify-center py-4">
                  <LoadingIndicator />
                </div>
              )}

              {preCheckError && (
                <div className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
                    <p className="text-dynamic-orange text-sm">
                      {t('delete-account-subscription-check-failed')}
                    </p>
                  </div>
                </div>
              )}

              {isBlocked && preCheck.blockingWorkspaces.length > 0 && (
                <div className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
                      <div className="space-y-1">
                        <p className="font-medium text-dynamic-orange text-sm">
                          {t('delete-account-active-subscriptions')}
                        </p>
                        <p className="text-dynamic-orange/80 text-xs">
                          {t('delete-account-active-subscriptions-description')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {preCheck.blockingWorkspaces.map((workspace) => (
                        <div
                          className="flex items-center justify-between rounded-md bg-dynamic-orange/10 px-3 py-2"
                          key={workspace.wsId}
                        >
                          <span className="font-medium text-sm">
                            {workspace.wsName}
                          </span>
                          <span className="inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-border bg-transparent px-2 py-0.5 font-semibold text-foreground text-xs">
                            {workspace.tier}
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="text-dynamic-orange/80 text-xs">
                      {t('delete-account-cancel-subscriptions-first')}
                    </p>

                    <Button
                      className="w-full"
                      onClick={() => {
                        window.location.assign(`/${locale}`);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      <ExternalLink className="mr-2 h-3 w-3" />
                      {t('delete-account-go-to-billing')}
                    </Button>
                  </div>
                </div>
              )}

              {!preCheckLoading && !isBlocked && !preCheckError && (
                <>
                  <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
                      <div className="space-y-2">
                        <p className="font-medium text-dynamic-red text-sm">
                          {t('delete-account-data-warning')}
                        </p>
                        <ul className="list-disc space-y-1 pl-4 text-dynamic-red text-sm">
                          <li>{t('delete-account-data-profile')}</li>
                          <li>{t('delete-account-data-workspaces')}</li>
                          <li>{t('delete-account-data-chats')}</li>
                          <li>{t('delete-account-data-settings')}</li>
                          <li>{t('delete-account-data-subscriptions')}</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {hasCleanupWork && (
                    <>
                      <div className="h-px w-full bg-border" />
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex gap-2">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="space-y-1">
                            <p className="font-medium text-sm">
                              {t('delete-account-cleanup-notice')}
                            </p>
                            <ul className="list-disc space-y-1 pl-4 text-muted-foreground text-xs">
                              {preCheck.cleanupSummary.workspacesToDelete >
                                0 && (
                                <li>
                                  {t(
                                    'delete-account-cleanup-workspace-deleted',
                                    {
                                      count:
                                        preCheck.cleanupSummary
                                          .workspacesToDelete,
                                    }
                                  )}
                                </li>
                              )}
                              {preCheck.cleanupSummary.seatsToRevoke > 0 && (
                                <li>
                                  {t('delete-account-cleanup-seat-revoked', {
                                    count:
                                      preCheck.cleanupSummary.seatsToRevoke,
                                  })}
                                </li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="confirm-email">
                      {t('delete-account-confirm-email')}
                    </Label>
                    <Input
                      autoComplete="email"
                      disabled={deleting}
                      id="confirm-email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t('email-address')}
                      type="email"
                      value={email}
                    />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-3">
                {!isBlocked && !preCheckLoading && !preCheckError && (
                  <Button
                    className="w-full"
                    disabled={deleting || !email.trim()}
                    onClick={handleDelete}
                    variant="destructive"
                  >
                    {deleting ? (
                      <LoadingIndicator className="mr-2 h-4 w-4" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {deleting
                      ? t('delete-account-deleting')
                      : t('delete-account-button')}
                  </Button>
                )}
                <Button
                  className="w-full"
                  disabled={deleting}
                  onClick={() => {
                    window.location.assign(`/${locale}`);
                  }}
                  variant="outline"
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {t('cancel')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

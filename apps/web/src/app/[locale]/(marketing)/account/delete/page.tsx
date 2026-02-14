'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Info,
  ShieldAlert,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type PreCheckResponse = {
  canDelete: boolean;
  blockingWorkspaces: {
    wsId: string;
    wsName: string;
    tier: string;
    memberCount: number;
  }[];
  cleanupSummary: {
    workspacesToDelete: number;
    seatsToRevoke: number;
  };
};

export default function DeleteAccountPage() {
  const t = useTranslations('settings-account');
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');

  // Auth check via TanStack Query
  const { data: authUser, isLoading: authLoading } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?nextUrl=/account/delete');
        return null;
      }
      return user;
    },
  });

  const authenticated = !!authUser;

  // Subscription pre-check
  const {
    data: preCheck,
    isLoading: preCheckLoading,
    isError: preCheckError,
  } = useQuery<PreCheckResponse>({
    queryKey: ['account-delete-precheck'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/me/delete');
      if (!res.ok) throw new Error('Pre-check failed');
      return res.json();
    },
    enabled: authenticated,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (confirmEmail: string) => {
      const res = await fetch('/api/v1/users/me/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: confirmEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) {
          throw new Error('BLOCKED_BY_SUBSCRIPTIONS');
        }
        if (res.status === 400 && data.message?.includes('does not match')) {
          throw new Error('EMAIL_MISMATCH');
        }
        throw new Error(data.message || 'DELETE_FAILED');
      }

      return res.json();
    },
    onSuccess: async () => {
      toast.success(t('delete-account-success'));
      await supabase.auth.signOut({ scope: 'local' });
      router.push('/login');
      router.refresh();
    },
    onError: (error: Error) => {
      if (error.message === 'BLOCKED_BY_SUBSCRIPTIONS') {
        toast.error(t('delete-account-blocked-by-subscriptions'));
      } else if (error.message === 'EMAIL_MISMATCH') {
        toast.error(t('delete-account-email-mismatch'));
      } else {
        toast.error(t('delete-account-error'));
      }
    },
  });

  const handleDelete = () => {
    if (!email.trim()) return;
    deleteMutation.mutate(email.trim());
  };

  const handleGoToDashboard = () => {
    router.push('/');
    router.refresh();
  };

  if (authLoading || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  const isBlocked = preCheck?.canDelete === false;
  const hasCleanupWork =
    preCheck &&
    (preCheck.cleanupSummary.workspacesToDelete > 0 ||
      preCheck.cleanupSummary.seatsToRevoke > 0);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-linear-to-br from-background via-dynamic-red/5 to-dynamic-orange/10" />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <TuturuuLogo width={80} height={80} />
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
              {/* Pre-check loading state */}
              {preCheckLoading && (
                <div className="flex items-center justify-center py-4">
                  <LoadingIndicator />
                </div>
              )}

              {/* Pre-check error */}
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

              {/* Blocking subscriptions warning */}
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
                      {preCheck.blockingWorkspaces.map((ws) => (
                        <div
                          key={ws.wsId}
                          className="flex items-center justify-between rounded-md bg-dynamic-orange/10 px-3 py-2"
                        >
                          <span className="font-medium text-sm">
                            {ws.wsName}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {ws.tier}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    <p className="text-dynamic-orange/80 text-xs">
                      {t('delete-account-cancel-subscriptions-first')}
                    </p>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => router.push('/')}
                    >
                      <ExternalLink className="mr-2 h-3 w-3" />
                      {t('delete-account-go-to-billing')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Warning banner — shown when not blocked */}
              {!preCheckLoading && !isBlocked && (
                <>
                  <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
                      <div className="space-y-2">
                        <p className="font-medium text-dynamic-red text-sm">
                          {t('delete-account-data-warning')}
                        </p>
                        <ul className="space-y-1 text-dynamic-red text-sm">
                          <li>• {t('delete-account-data-profile')}</li>
                          <li>• {t('delete-account-data-workspaces')}</li>
                          <li>• {t('delete-account-data-chats')}</li>
                          <li>• {t('delete-account-data-settings')}</li>
                          <li>• {t('delete-account-data-subscriptions')}</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Cleanup summary */}
                  {hasCleanupWork && (
                    <>
                      <Separator />
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex gap-2">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="space-y-1">
                            <p className="font-medium text-sm">
                              {t('delete-account-cleanup-notice')}
                            </p>
                            <ul className="space-y-1 text-muted-foreground text-xs">
                              {preCheck.cleanupSummary.workspacesToDelete >
                                0 && (
                                <li>
                                  •{' '}
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
                                  •{' '}
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

                  {/* Email confirmation input */}
                  <div className="space-y-2">
                    <Label htmlFor="confirm-email" className="text-sm">
                      {t('delete-account-confirm-email')}
                    </Label>
                    <Input
                      id="confirm-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('email-address')}
                      disabled={deleteMutation.isPending}
                      autoComplete="email"
                    />
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                {!isBlocked && !preCheckLoading && !preCheckError && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleDelete}
                    disabled={
                      deleteMutation.isPending || !email.trim() || isBlocked
                    }
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deleteMutation.isPending
                      ? t('delete-account-deleting')
                      : t('delete-account-button')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGoToDashboard}
                  disabled={deleteMutation.isPending}
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

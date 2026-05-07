'use client';

import type { StoredAccountWithEmail } from '@tuturuuu/auth';
import { Mail, UserRound } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const authContainerTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

function LoginMethodSeparator({ label }: { label: string }) {
  return (
    <div className="relative py-0.5">
      <Separator className="bg-border/60" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bg-background/95 px-3 text-muted-foreground text-xs">
          {label}
        </span>
      </div>
    </div>
  );
}

export function InternalAppAccountConfirmation({
  accounts,
  activeAccountId,
  appName,
  confirming,
  currentEmail,
  currentUserId,
  isAccountSwitcherReady,
  onContinue,
  onSwitchAccount,
  onUseAnotherAccount,
  switchingAccountId,
}: {
  accounts: StoredAccountWithEmail[];
  activeAccountId: string | null;
  appName: string;
  confirming: boolean;
  currentEmail: string;
  currentUserId: string;
  isAccountSwitcherReady: boolean;
  onContinue: () => void;
  onSwitchAccount: (accountId: string) => void;
  onUseAnotherAccount: () => void;
  switchingAccountId: string | null;
}) {
  const t = useTranslations();
  const alternativeAccounts = accounts.filter(
    (account) => account.id !== currentUserId && account.id !== activeAccountId
  );

  return (
    <motion.div layout transition={authContainerTransition}>
      <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-dynamic-green/10 text-dynamic-green">
              <UserRound className="size-7" />
            </div>
            <h2 className="font-semibold text-2xl tracking-tight">
              {t('login.confirm_internal_app_account_title', { app: appName })}
            </h2>
            <p className="text-balance text-muted-foreground text-sm">
              {t('login.confirm_internal_app_account_description', {
                app: appName,
              })}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <p className="text-muted-foreground text-xs">
              {t('login.signed_in_as')}
            </p>
            <p className="mt-1 break-all font-semibold text-foreground">
              {currentEmail}
            </p>
          </div>

          <div className="space-y-3">
            <Button
              className="h-12 w-full rounded-2xl font-medium shadow-lg"
              disabled={confirming || switchingAccountId !== null}
              onClick={onContinue}
            >
              {confirming ? (
                <div className="flex items-center gap-2">
                  <LoadingIndicator className="size-4" />
                  <span>{t('common.loading')}...</span>
                </div>
              ) : (
                t('login.continue_to_internal_app', { app: appName })
              )}
            </Button>
            <Button
              className="h-11 w-full rounded-2xl"
              disabled={confirming || switchingAccountId !== null}
              onClick={onUseAnotherAccount}
              type="button"
              variant="outline"
            >
              {t('login.use_another_account')}
            </Button>
          </div>

          {isAccountSwitcherReady && alternativeAccounts.length > 0 ? (
            <div className="space-y-3">
              <LoginMethodSeparator label={t('login.or_switch_account')} />
              <div className="space-y-2">
                {alternativeAccounts.map((account) => (
                  <Button
                    className="h-auto min-h-11 w-full justify-start rounded-2xl px-4 py-3 text-left"
                    disabled={confirming || switchingAccountId !== null}
                    key={account.id}
                    onClick={() => onSwitchAccount(account.id)}
                    type="button"
                    variant="secondary"
                  >
                    {switchingAccountId === account.id ? (
                      <LoadingIndicator className="size-4" />
                    ) : (
                      <Mail className="size-4" />
                    )}
                    <span className="min-w-0 truncate">{account.email}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

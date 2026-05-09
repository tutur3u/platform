'use client';

import type { StoredAccountWithEmail } from '@tuturuuu/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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

function getDisplayName({
  displayName,
  email,
  fallback,
}: {
  displayName?: string | null;
  email?: string | null;
  fallback: string;
}) {
  return displayName?.trim() || email?.trim() || fallback;
}

function getAvatarUrl(avatarUrl?: string | null) {
  return avatarUrl?.trim() || undefined;
}

function getInitials(value: string) {
  const initials = value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return initials || '?';
}

export function InternalAppAccountConfirmation({
  accounts,
  activeAccountId,
  appName,
  confirming,
  currentAvatarUrl,
  currentDisplayName,
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
  currentAvatarUrl?: string | null;
  currentDisplayName?: string | null;
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
  const fallbackAccountName = t('login.unknown_account');
  const currentAccountName = getDisplayName({
    displayName: currentDisplayName,
    email: currentEmail,
    fallback: fallbackAccountName,
  });
  const currentAccountAvatarUrl = getAvatarUrl(currentAvatarUrl);
  const currentAccountInitials = getInitials(currentAccountName);
  const showCurrentEmail = currentEmail && currentEmail !== currentAccountName;

  return (
    <motion.div layout transition={authContainerTransition}>
      <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <Avatar className="mx-auto size-16 border border-border/70 shadow-sm">
              <AvatarImage
                alt={currentAccountName}
                src={currentAccountAvatarUrl}
              />
              <AvatarFallback className="bg-dynamic-green/10 font-semibold text-dynamic-green text-lg">
                {currentAccountInitials}
              </AvatarFallback>
            </Avatar>
            <h2 className="font-semibold text-2xl tracking-tight">
              {t('login.confirm_internal_app_account_title', {
                app: appName,
                name: currentAccountName,
              })}
            </h2>
            <p className="text-balance text-muted-foreground text-sm">
              {t('login.confirm_internal_app_account_description', {
                app: appName,
                name: currentAccountName,
              })}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <Avatar className="size-11 border border-border/70">
              <AvatarImage
                alt={currentAccountName}
                src={currentAccountAvatarUrl}
              />
              <AvatarFallback className="bg-foreground/10 font-semibold">
                {currentAccountInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">
                {t('login.signed_in_as')}
              </p>
              <p className="truncate font-semibold text-foreground">
                {currentAccountName}
              </p>
              {showCurrentEmail ? (
                <p className="truncate text-muted-foreground text-sm">
                  {currentEmail}
                </p>
              ) : null}
            </div>
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
                {alternativeAccounts.map((account) => {
                  const displayName = getDisplayName({
                    displayName: account.metadata.displayName,
                    email: account.email,
                    fallback: fallbackAccountName,
                  });
                  const avatarUrl = getAvatarUrl(account.metadata.avatarUrl);
                  const initials = getInitials(displayName);
                  const showEmail =
                    account.email && account.email !== displayName;

                  return (
                    <Button
                      className="h-auto min-h-11 w-full justify-start rounded-2xl px-4 py-3 text-left"
                      disabled={confirming || switchingAccountId !== null}
                      key={account.id}
                      onClick={() => onSwitchAccount(account.id)}
                      type="button"
                      variant="secondary"
                    >
                      {switchingAccountId === account.id ? (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background/70">
                          <LoadingIndicator className="size-4" />
                        </span>
                      ) : (
                        <Avatar className="size-8 shrink-0">
                          <AvatarImage alt={displayName} src={avatarUrl} />
                          <AvatarFallback className="bg-foreground/10 text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {displayName}
                        </span>
                        {showEmail ? (
                          <span className="block truncate text-muted-foreground text-xs">
                            {account.email}
                          </span>
                        ) : null}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

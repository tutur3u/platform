'use client';

import { ArrowRight, ShieldCheck } from '@tuturuuu/icons/lucide-static';
import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import {
  ConfirmationCard,
  getAvatarUrl,
  getDisplayName,
  getInitials,
  ProfileLoadingState,
  type ProfileState,
  ProfileUnavailableState,
  StoredAccountSwitchList,
} from './internal-app-account-confirmation-parts';

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
  onRetryProfile,
  onSwitchAccount,
  onUseAnotherAccount,
  profileState,
  switchingAccountId,
}: {
  accounts: WebAccountSummary[];
  activeAccountId: string | null;
  appName: string;
  confirming: boolean;
  currentAvatarUrl?: string | null;
  currentDisplayName?: string | null;
  currentEmail?: string | null;
  currentUserId: string;
  isAccountSwitcherReady: boolean;
  onContinue: () => void;
  onRetryProfile: () => void;
  onSwitchAccount: (accountId: string) => void;
  onUseAnotherAccount: () => void;
  profileState: ProfileState;
  switchingAccountId: string | null;
}) {
  const t = useTranslations();
  const controlsDisabled = confirming || switchingAccountId !== null;

  if (profileState === 'loading') {
    return (
      <ProfileLoadingState
        appName={appName}
        disabled={controlsDisabled}
        onUseAnotherAccount={onUseAnotherAccount}
      />
    );
  }

  if (profileState === 'unavailable') {
    return (
      <ProfileUnavailableState
        disabled={controlsDisabled}
        onRetryProfile={onRetryProfile}
        onUseAnotherAccount={onUseAnotherAccount}
      />
    );
  }

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
    <ConfirmationCard>
      <div className="space-y-2 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
          <ShieldCheck className="size-3.5" />
          {t('login.profile_source_label')}
        </div>
        <div className="relative mx-auto size-20">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-dynamic-blue/20 via-dynamic-green/20 to-dynamic-red/20 blur-md" />
          <Avatar className="relative size-20 border border-border/70 shadow-lg">
            <AvatarImage
              alt={currentAccountName}
              src={currentAccountAvatarUrl}
            />
            <AvatarFallback className="bg-dynamic-green/10 font-semibold text-dynamic-green text-xl">
              {currentAccountInitials}
            </AvatarFallback>
          </Avatar>
        </div>
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

      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-muted/30 to-background/60 p-4 shadow-sm">
        <Avatar className="size-12 border border-border/70">
          <AvatarImage alt={currentAccountName} src={currentAccountAvatarUrl} />
          <AvatarFallback className="bg-foreground/10 font-semibold">
            {currentAccountInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <ShieldCheck className="size-3 text-dynamic-green" />
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
          className="group h-12 w-full rounded-2xl font-medium shadow-lg"
          disabled={controlsDisabled}
          onClick={onContinue}
        >
          {confirming ? (
            <div className="flex items-center gap-2">
              <LoadingIndicator className="size-4" />
              <span>{t('common.loading')}...</span>
            </div>
          ) : (
            <>
              <span>
                {t('login.continue_to_internal_app', { app: appName })}
              </span>
              <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
        <Button
          className="h-11 w-full rounded-2xl"
          disabled={controlsDisabled}
          onClick={onUseAnotherAccount}
          type="button"
          variant="outline"
        >
          {t('login.use_another_account')}
        </Button>
      </div>

      {isAccountSwitcherReady ? (
        <StoredAccountSwitchList
          accounts={alternativeAccounts}
          disabled={controlsDisabled}
          fallbackAccountName={fallbackAccountName}
          onSwitchAccount={onSwitchAccount}
          switchingAccountId={switchingAccountId}
        />
      ) : null}
    </ConfirmationCard>
  );
}

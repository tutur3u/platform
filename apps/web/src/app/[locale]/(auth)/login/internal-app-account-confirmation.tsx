'use client';

import { ShieldCheck } from '@tuturuuu/icons/lucide-static';
import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import {
  AccountAvatarCard,
  CoBrandRow,
  StatusChip,
} from './continue-card-parts';
import {
  ConfirmationCard,
  getDisplayName,
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
  const showCurrentEmail = currentEmail && currentEmail !== currentAccountName;

  return (
    <ConfirmationCard>
      <CoBrandRow appName={appName} />
      <div className="flex flex-col gap-1.5 text-center">
        <h2 className="text-balance font-extrabold text-2xl tracking-[-0.02em]">
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

      <AccountAvatarCard
        avatarUrl={currentAvatarUrl}
        chip={
          <StatusChip>
            <ShieldCheck aria-hidden className="mr-1.5 size-3.5" />
            {t('login.profile_source_label')}
          </StatusChip>
        }
        detail={showCurrentEmail ? currentEmail : null}
        name={currentAccountName}
      />

      <div className="flex flex-col gap-2.5">
        <Button
          className="h-12 w-full rounded-2xl font-bold"
          disabled={controlsDisabled}
          onClick={onContinue}
        >
          {confirming ? (
            <span className="flex items-center gap-2">
              <LoadingIndicator className="size-4" />
              {t('login.securing_session')}
            </span>
          ) : (
            <span className="min-w-0 truncate">
              {t('login.continue_as', { name: currentAccountName })}
            </span>
          )}
        </Button>
        <Button
          className="h-12 w-full rounded-2xl font-bold"
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

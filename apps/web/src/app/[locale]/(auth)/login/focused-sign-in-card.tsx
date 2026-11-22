'use client';

import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AccountAvatarCard, StatusChip } from './continue-card-parts';
import {
  ConfirmationCard,
  getDisplayName,
  StoredAccountSwitchList,
} from './internal-app-account-confirmation-parts';
import type { FocusedSignInStep } from './login-view';
import { PendingLabel, usePendingPhase } from './pending-label';

/**
 * Every step shares this fixed-height frame, so switching steps never
 * shifts layout; a long saved-account list scrolls inside it.
 */
function FocusedFrame({ children }: { children: ReactNode }) {
  return (
    <ConfirmationCard>
      <div
        aria-live="polite"
        className="flex h-[22rem] flex-col justify-center gap-4 overflow-hidden"
      >
        {children}
      </div>
    </ConfirmationCard>
  );
}

export function FocusedSignInSkeleton() {
  return (
    <FocusedFrame>
      <div className="flex animate-pulse flex-col items-center gap-4">
        <div className="size-16 rounded-full bg-muted" />
        <div className="h-5 w-40 rounded-full bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="h-12 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-11 w-full animate-pulse rounded-2xl bg-muted/60" />
      </div>
    </FocusedFrame>
  );
}

export function FocusedSignInCard({
  appName,
  canContinue,
  continuing,
  onContinue,
  onStartProvider,
  onSwitchAccount,
  onUseAnotherAccount,
  providerName,
  savedAccounts,
  session,
  startingProvider,
  step,
  switchingAccountId,
}: {
  appName: string;
  canContinue: boolean;
  continuing: boolean;
  onContinue: () => void;
  onStartProvider: () => void;
  onSwitchAccount: (accountId: string) => void;
  onUseAnotherAccount: () => void;
  providerName: string;
  savedAccounts: WebAccountSummary[];
  session: { avatarUrl: string | null; name: string | null } | null;
  startingProvider: boolean;
  step: FocusedSignInStep;
  switchingAccountId: string | null;
}) {
  const t = useTranslations();
  const busy = continuing || startingProvider || switchingAccountId !== null;
  const continuePhase = usePendingPhase(continuing);

  if (step === 'provider') {
    return (
      <FocusedFrame>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <LoadingIndicator className="size-6" />
          </div>
          <p className="font-bold text-foreground" role="status">
            {t('login.continuing_with_provider', { provider: providerName })}
          </p>
        </div>
        <Button
          className="h-12 w-full rounded-2xl font-bold"
          disabled={startingProvider}
          onClick={onStartProvider}
          type="button"
          variant="outline"
        >
          {t('login.continue_with_provider', { provider: providerName })}
        </Button>
      </FocusedFrame>
    );
  }

  if (step === 'choose') {
    return (
      <FocusedFrame>
        <h2 className="text-center font-extrabold text-2xl tracking-[-0.02em]">
          {t('login.choose_account_title')}
        </h2>
        <div className="min-h-0 overflow-y-auto">
          <StoredAccountSwitchList
            accounts={savedAccounts}
            disabled={busy}
            fallbackAccountName={t('login.unknown_account')}
            onSwitchAccount={onSwitchAccount}
            separatorLabel={null}
            switchingAccountId={switchingAccountId}
          />
        </div>
        <Button
          className="h-12 w-full shrink-0 rounded-2xl font-bold"
          disabled={busy}
          onClick={onUseAnotherAccount}
          type="button"
          variant="outline"
        >
          {t('login.use_another_account')}
        </Button>
      </FocusedFrame>
    );
  }

  const name = getDisplayName({
    displayName: session?.name,
    fallback: t('login.unknown_account'),
  });

  return (
    <FocusedFrame>
      <p className="text-center text-muted-foreground text-sm">
        {t('login.signed_in_on_browser')}
      </p>
      <AccountAvatarCard
        avatarUrl={session?.avatarUrl}
        chip={<StatusChip>{t('login.signed_in_chip')}</StatusChip>}
        name={name}
      />
      <div className="flex flex-col gap-2.5">
        <Button
          className="relative h-12 w-full rounded-2xl px-12 font-bold"
          disabled={!canContinue || busy}
          onClick={onContinue}
          type="button"
        >
          {continuing ? (
            <>
              <span
                aria-hidden
                className="absolute top-1/2 left-4 flex -translate-y-1/2"
              >
                <LoadingIndicator className="size-4" />
              </span>
              <PendingLabel
                labels={[
                  t('login.continuing'),
                  t('login.securing_session'),
                  t('login.opening_app', { app: appName }),
                ]}
                phase={continuePhase}
              />
            </>
          ) : (
            <span className="min-w-0 truncate">
              {t('login.continue_as', { name })}
            </span>
          )}
        </Button>
        <Button
          className="h-12 w-full rounded-2xl font-bold"
          disabled={busy}
          onClick={onUseAnotherAccount}
          type="button"
          variant="outline"
        >
          {t('login.use_another_account')}
        </Button>
      </div>
    </FocusedFrame>
  );
}

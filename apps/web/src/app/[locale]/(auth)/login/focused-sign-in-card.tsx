'use client';

import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  ConfirmationCard,
  getAvatarUrl,
  getDisplayName,
  getInitials,
  StoredAccountSwitchList,
} from './internal-app-account-confirmation-parts';
import type { FocusedSignInStep } from './login-view';

/** Every step shares this frame, so switching steps never shifts layout. */
function FocusedFrame({ children }: { children: ReactNode }) {
  return (
    <ConfirmationCard>
      <div
        aria-live="polite"
        className="flex min-h-64 flex-col justify-center gap-6"
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

  if (step === 'provider') {
    return (
      <FocusedFrame>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full border border-border bg-muted/40">
            <LoadingIndicator className="size-6" />
          </div>
          <p className="font-medium text-foreground">
            {t('login.continuing_with_provider', { provider: providerName })}
          </p>
        </div>
        <Button
          className="h-12 w-full rounded-2xl font-medium"
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
        <h2 className="text-center font-semibold text-xl tracking-tight">
          {t('login.choose_account_title')}
        </h2>
        <StoredAccountSwitchList
          accounts={savedAccounts}
          disabled={busy}
          fallbackAccountName={t('login.unknown_account')}
          onSwitchAccount={onSwitchAccount}
          separatorLabel={null}
          switchingAccountId={switchingAccountId}
        />
        <Button
          className="h-11 w-full rounded-2xl"
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
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar className="size-16 border border-border">
          <AvatarImage alt={name} src={getAvatarUrl(session?.avatarUrl)} />
          <AvatarFallback className="bg-muted font-semibold text-lg">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-0.5">
          <p className="text-muted-foreground text-xs">
            {t('login.signed_in_as')}
          </p>
          <p className="truncate font-semibold text-lg">{name}</p>
        </div>
      </div>
      <div className="space-y-3">
        <Button
          aria-busy={continuing}
          className="h-12 w-full rounded-2xl font-medium"
          disabled={!canContinue || busy}
          onClick={onContinue}
          type="button"
        >
          {continuing ? <LoadingIndicator className="mr-2 size-4" /> : null}
          {t('login.continue_to_internal_app', { app: appName })}
        </Button>
        <Button
          className="h-11 w-full rounded-2xl"
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

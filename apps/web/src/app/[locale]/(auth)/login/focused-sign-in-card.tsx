'use client';

import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { getAuthOAuthProviderOptions } from '@/lib/auth/oauth-providers';
import {
  FOCUSED_LINK_CLASS,
  FocusedContinueStep,
} from './focused-continue-step';
import {
  ConfirmationCard,
  StoredAccountSwitchList,
} from './internal-app-account-confirmation-parts';
import { SocialImageLogo, SocialLogoMask } from './login-form-parts';
import { type FocusedSignInStep, withoutProviderHint } from './login-view';
import { SocialLoginButton } from './social-login-button';

type FocusedProvider = 'apple' | 'github' | 'google';

/** Every step shares this frame, so the card keeps one shape and rhythm. */
function FocusedFrame({ children }: { children: ReactNode }) {
  return (
    <ConfirmationCard>
      <div className="flex flex-col justify-center gap-4">{children}</div>
    </ConfirmationCard>
  );
}

export function FocusedSignInSkeleton() {
  return (
    <FocusedFrame>
      <div className="flex animate-pulse items-center gap-3 rounded-2xl border p-3 motion-reduce:animate-none">
        <div className="size-11 rounded-full bg-muted" />
        <div className="h-4 w-40 rounded-full bg-muted" />
      </div>
      <div className="h-12 w-full animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="mx-auto h-4 w-36 animate-pulse rounded-full bg-muted/60 motion-reduce:animate-none" />
    </FocusedFrame>
  );
}

function ProviderIcon({ provider }: { provider: FocusedProvider }) {
  if (provider === 'google') {
    return <SocialImageLogo alt="Google" src="/media/logos/google.svg" />;
  }
  const name = getAuthOAuthProviderOptions(provider).name;
  return <SocialLogoMask alt={name} src={`/media/logos/${provider}.svg`} />;
}

export function FocusedSignInCard({
  appName,
  autoContinue,
  canContinue,
  continuing,
  onContinue,
  onStartProvider,
  onSwitchAccount,
  onUseAnotherAccount,
  provider,
  savedAccounts,
  session,
  startingProvider,
  step,
  switchingAccountId,
}: {
  appName: string;
  autoContinue: boolean;
  canContinue: boolean;
  continuing: boolean;
  onContinue: () => void;
  onStartProvider: () => void;
  onSwitchAccount: (accountId: string) => void;
  onUseAnotherAccount: () => void;
  provider: FocusedProvider;
  savedAccounts: WebAccountSummary[];
  session: { avatarUrl: string | null; name: string | null } | null;
  startingProvider: boolean;
  step: FocusedSignInStep;
  switchingAccountId: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const busy = continuing || startingProvider || switchingAccountId !== null;
  const providerName = getAuthOAuthProviderOptions(provider).name;

  if (step === 'provider') {
    return (
      <FocusedFrame>
        <SocialLoginButton
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={startingProvider}
          icon={
            startingProvider ? (
              <LoadingIndicator className="size-5 text-primary-foreground" />
            ) : (
              // The label names the provider; the logo is decoration.
              <span aria-hidden className="flex">
                <ProviderIcon provider={provider} />
              </span>
            )
          }
          onClick={onStartProvider}
          variant="default"
        >
          {startingProvider
            ? t('login.continuing_with_provider', { provider: providerName })
            : t('login.continue_with_provider', { provider: providerName })}
        </SocialLoginButton>
        <button
          className={FOCUSED_LINK_CLASS}
          disabled={startingProvider}
          // Keeps the return and its challenge; shows every method.
          onClick={() =>
            router.replace(withoutProviderHint(window.location.href))
          }
          type="button"
        >
          {t('login.more_sign_in_options')}
        </button>
      </FocusedFrame>
    );
  }

  if (step === 'choose') {
    return (
      <FocusedFrame>
        <h2 className="text-center font-extrabold text-xl tracking-[-0.01em]">
          {t('login.choose_account_title')}
        </h2>
        <div className="max-h-[17rem] min-h-0 overflow-y-auto">
          <StoredAccountSwitchList
            accounts={savedAccounts}
            disabled={busy}
            fallbackAccountName={t('login.unknown_account')}
            onSwitchAccount={onSwitchAccount}
            separatorLabel={null}
            switchingAccountId={switchingAccountId}
          />
        </div>
        <button
          className={FOCUSED_LINK_CLASS}
          disabled={busy}
          onClick={onUseAnotherAccount}
          type="button"
        >
          {t('login.use_another_account')}
        </button>
      </FocusedFrame>
    );
  }

  return (
    <FocusedFrame>
      <FocusedContinueStep
        appName={appName}
        autoContinue={autoContinue}
        busy={busy}
        canContinue={canContinue}
        continuing={continuing}
        onContinue={onContinue}
        onUseAnotherAccount={onUseAnotherAccount}
        session={session}
      />
    </FocusedFrame>
  );
}

'use client';

import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import { XIcon } from '@tuturuuu/icons/lucide-static';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { DEV_MODE } from '@/constants/env';
// Imported eagerly so the form renders with the shell; a lazy chunk would
// swap a shorter skeleton for it and move the centered column.
import LoginForm from './form';
import { AuthStagePanel } from './auth-stage-panel';
import { AuthTopControls } from './auth-top-controls';
import { LoginFooter } from './login-footer';
import {
  isFocusedExternalSignIn,
  mayBeFocusedExternalSignIn,
} from './login-view';
import { useLoginView } from './use-login-view';

export type LoginDomain = {
  href: string;
  logo: string;
  name: string;
};

export type LoginRuntimeSupabaseConfig = {
  supabasePublishableKey: string;
  supabaseUrl: string;
};

type LoginContentProps = {
  authCallbackRedirect?: (url: string) => void;
  localE2EAuthBypass: boolean;
  runtimeSupabaseConfig: LoginRuntimeSupabaseConfig | null;
};

const DOMAINS = {
  TUTURUUU: {
    name: 'Tuturuuu',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('platform')
      : 'https://tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  CHAT: {
    name: 'Chat',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('chat')
      : 'https://chat.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  NOVA: {
    name: 'Nova',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('nova')
      : 'https://nova.ai.vn',
    logo: '/media/logos/nova/nova-transparent.png',
  },
  LEARN: {
    name: 'Learn',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('learn')
      : 'https://learn.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  TEACH: {
    name: 'Teach',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('teach')
      : 'https://teach.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  INVENTORY: {
    name: 'Inventory',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('inventory')
      : 'https://inventory.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
} as const satisfies Record<string, LoginDomain>;

function getReturnUrlDomain(url: string | null) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }

    return urlObj.host;
  } catch {
    return null;
  }
}

function getSafeLocalRedirectPath(value: string | null) {
  const normalizedPath = normalizeClientRedirectPath(value, '');

  if (!normalizedPath) {
    return null;
  }

  try {
    const parsedPath = new URL(normalizedPath, 'https://tuturuuu.local');

    return parsedPath.pathname.endsWith('/login') ? null : normalizedPath;
  } catch {
    return null;
  }
}

function LoginDomainLogo({ domain }: { domain: LoginDomain }) {
  return (
    <span
      aria-label={`${domain.name} Logo`}
      className="block size-12 bg-center bg-contain bg-no-repeat"
      role="img"
      style={{ backgroundImage: `url(${domain.logo})` }}
    />
  );
}

function LoginFormFallback() {
  return (
    <div className="animate-pulse space-y-3 motion-reduce:animate-none">
      <div className="h-5 w-32 rounded-full bg-muted" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="h-12 w-full rounded-full bg-muted"
          key={`login-fallback-${index.toString()}`}
        />
      ))}
    </div>
  );
}

export function LoginContent({
  authCallbackRedirect,
  localE2EAuthBypass,
  runtimeSupabaseConfig,
}: LoginContentProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const multiAccount = searchParams.get('multiAccount') === 'true';
  const callbackCode = searchParams.get('code');
  const callbackSearch = searchParams.toString();
  const currentDomain = useMemo(() => {
    const returnUrlDomain = getReturnUrlDomain(returnUrl);

    return returnUrlDomain
      ? (Object.values(DOMAINS).find((domain) =>
          domain.href.includes(returnUrlDomain)
        ) ?? null)
      : DOMAINS.TUTURUUU;
  }, [returnUrl]);
  const deferAuthSurfaceUntilSessionCheck = Boolean(
    returnUrl && !multiAccount && !getSafeLocalRedirectPath(returnUrl)
  );
  const tuturuuuDomain = DOMAINS.TUTURUUU;
  const loginView = useLoginView();
  const provider = searchParams.get('provider');
  const focusedAppName = isFocusedExternalSignIn(loginView.data, multiAccount)
    ? (loginView.data?.returnApp?.name ?? null)
    : null;
  const focusedPending =
    loginView.pending &&
    mayBeFocusedExternalSignIn({ multiAccount, provider, returnUrl });

  useEffect(() => {
    if (!callbackCode) {
      return;
    }

    const redirect =
      authCallbackRedirect ?? window.location.replace.bind(window.location);
    redirect(`/api/auth/callback?${callbackSearch}`);
  }, [authCallbackRedirect, callbackCode, callbackSearch]);

  const isPartnerDomain =
    currentDomain !== null && currentDomain.href !== tuturuuuDomain.href;
  const usesTuturuuuLogo = currentDomain?.logo === tuturuuuDomain.logo;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="relative mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-4 p-4 lg:grid lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
        <AuthStagePanel />

        <section className="flex min-w-0 flex-1 flex-col lg:px-6 lg:py-2">
          {/* Over the hero on phones and tablets; first in the tab order. */}
          <div className="absolute top-7 right-7 z-10 lg:static">
            <AuthTopControls />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-6 md:py-8">
            <div className="fade-in-0 slide-in-from-bottom-4 flex w-full max-w-[400px] animate-in flex-col gap-6 duration-300 motion-reduce:animate-none md:max-w-[440px] lg:max-w-[400px]">
              {focusedAppName || focusedPending ? (
                <div className="flex flex-col gap-4">
                  <LoginDomainLogo domain={tuturuuuDomain} />
                  {focusedAppName ? (
                    <h1 className="text-balance font-extrabold text-[32px] leading-[1.08] tracking-[-0.025em]">
                      {t('login.sign_in_to_continue_to', {
                        app: focusedAppName,
                      })}
                    </h1>
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-9 w-72 max-w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none"
                    />
                  )}
                </div>
              ) : isPartnerDomain ? (
                <div className="flex flex-col gap-3">
                  {usesTuturuuuLogo ? (
                    <div className="flex items-center gap-3">
                      <LoginDomainLogo domain={tuturuuuDomain} />
                      <span className="inline-flex h-7 items-center rounded-full bg-secondary px-3 font-bold text-muted-foreground text-xs">
                        {currentDomain.name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <LoginDomainLogo domain={tuturuuuDomain} />
                      <XIcon
                        aria-hidden
                        className="size-5 text-muted-foreground"
                      />
                      <LoginDomainLogo domain={currentDomain} />
                    </div>
                  )}
                  <h1 className="text-balance font-extrabold text-[32px] leading-[1.08] tracking-[-0.025em]">
                    {t('login.welcome_to_tuturuuu')}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {t('login.powered-by', { domain: currentDomain.name })}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <h1 className="text-balance font-extrabold text-[32px] leading-[1.08] tracking-[-0.025em]">
                    {multiAccount
                      ? t('account_switcher.add_account')
                      : t('login.welcome_to_tuturuuu')}
                  </h1>
                  <p className="text-[15px] text-muted-foreground leading-relaxed">
                    {multiAccount
                      ? t('account_switcher.add_account_description')
                      : t('login.sign_in_or_create')}
                  </p>
                </div>
              )}

              {callbackCode ? (
                <LoginFormFallback />
              ) : (
                <LoginForm
                  deferAuthSurfaceUntilSessionCheck={
                    deferAuthSurfaceUntilSessionCheck
                  }
                  loginView={loginView}
                  localE2EAuthBypass={localE2EAuthBypass}
                  runtimeSupabaseConfig={runtimeSupabaseConfig}
                />
              )}
            </div>
          </div>

          <LoginFooter />
        </section>
      </div>
    </div>
  );
}

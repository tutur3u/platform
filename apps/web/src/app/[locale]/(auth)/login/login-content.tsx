'use client';

import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { DEV_MODE } from '@/constants/env';
// Imported eagerly so the form renders with the shell; a lazy chunk would
// swap a shorter skeleton for it and move the centered column.
import LoginForm from './form';
import { AuthTopControls } from './auth-top-controls';
import {
  type LoginBrandApp,
  LoginAppDisclaimer,
  LoginBrandHeader,
} from './login-brand';
import { LoginFooter } from './login-footer';
import { isAbsoluteHttpUrl } from './login-view';
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
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const multiAccount = searchParams.get('multiAccount') === 'true';
  const callbackCode = searchParams.get('code');
  const callbackSearch = searchParams.toString();
  const currentDomain = useMemo(() => {
    const returnUrlDomain = getReturnUrlDomain(returnUrl);

    return returnUrlDomain
      ? (Object.values(DOMAINS).find(
          // Exact host only: a substring match would brand a lookalike
          // such as `nova.ai` as Nova (`nova.ai.vn`).
          (domain) => getReturnUrlDomain(domain.href) === returnUrlDomain
        ) ?? null)
      : DOMAINS.TUTURUUU;
  }, [returnUrl]);
  const deferAuthSurfaceUntilSessionCheck = Boolean(
    returnUrl && !multiAccount && !getSafeLocalRedirectPath(returnUrl)
  );
  const loginView = useLoginView();
  const partnerDomain =
    currentDomain && currentDomain.href !== DOMAINS.TUTURUUU.href
      ? currentDomain
      : null;
  // Only the registry (through the private view) or the static first-party
  // list names the app; nothing in the query string ever does.
  const registeredApp = multiAccount
    ? null
    : (loginView.data?.returnApp ?? null);
  const brandApp: LoginBrandApp | null = registeredApp
    ? { logo: null, name: registeredApp.name }
    : partnerDomain
      ? { logo: partnerDomain.logo, name: partnerDomain.name }
      : null;
  // An unknown absolute return may still be a registered app: hold the
  // header's space until the view answers, so it never flashes Tuturuuu.
  const brandPending =
    loginView.pending &&
    !partnerDomain &&
    !multiAccount &&
    isAbsoluteHttpUrl(returnUrl);

  useEffect(() => {
    if (!callbackCode) {
      return;
    }

    const redirect =
      authCallbackRedirect ?? window.location.replace.bind(window.location);
    redirect(`/api/auth/callback?${callbackSearch}`);
  }, [authCallbackRedirect, callbackCode, callbackSearch]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-4 sm:px-6">
        <div className="flex justify-end">
          <AuthTopControls />
        </div>

        <main className="flex flex-1 flex-col items-center justify-center py-8 sm:py-12">
          <div className="fade-in-0 slide-in-from-bottom-2 flex w-full max-w-[400px] animate-in xl:max-w-[440px] flex-col gap-8 duration-300 motion-reduce:animate-none">
            <LoginBrandHeader
              app={brandApp}
              multiAccount={multiAccount}
              pending={brandPending}
            />

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

            {brandApp && !multiAccount ? (
              <LoginAppDisclaimer appName={brandApp.name} />
            ) : null}
          </div>
        </main>

        <LoginFooter />
      </div>
    </div>
  );
}

import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, DEV_MODE } from '@/constants/common';
import {
  getLocalE2ESupabaseBrowserConfig,
  isLocalE2EAuthBypassEnabled,
} from '@/lib/auth/local-e2e';
import { LoginContent, type LoginDomain } from './login-content';

const DOMAINS = {
  TUTURUUU: {
    name: 'Tuturuuu',
    href: BASE_URL,
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

const SUPABASE_AUTH_COOKIE_HEADER_PATTERN =
  /(?:^|;\s*)sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?=/u;

type LoginSearchParams = {
  [key: string]: string | string[] | undefined;
};

interface LoginProps {
  searchParams: Promise<LoginSearchParams>;
}

const getSingleSearchParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.at(0) : value;

const getReturnUrlDomain = (url: string | undefined) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // Ensure the URL uses http or https protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }
    return urlObj.host;
  } catch {
    return null;
  }
};

const appendSearchParam = (
  searchParams: URLSearchParams,
  key: string,
  value: string | string[] | undefined
) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      searchParams.append(key, entry);
    }
    return;
  }

  if (value !== undefined) {
    searchParams.set(key, value);
  }
};

const getSafeLocalRedirectPath = (value: string | undefined) => {
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
};

const getAuthenticatedLoginRedirectPath = (params: LoginSearchParams) => {
  if (getSingleSearchParam(params.multiAccount) === 'true') {
    return null;
  }

  const returnUrl = getSingleSearchParam(params.returnUrl);
  if (returnUrl) {
    return getSafeLocalRedirectPath(returnUrl);
  }

  return getSafeLocalRedirectPath(getSingleSearchParam(params.nextUrl)) ?? '/';
};

async function hasAuthenticatedSession() {
  try {
    const headerStore = await headers();

    if (
      !SUPABASE_AUTH_COOKIE_HEADER_PATTERN.test(headerStore.get('cookie') ?? '')
    ) {
      return false;
    }

    const [{ createClient }, { resolveAuthenticatedSessionUser }] =
      await Promise.all([
        import('@tuturuuu/supabase/next/server'),
        import('@tuturuuu/supabase/next/auth-session-user'),
      ]);
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    return Boolean(user);
  } catch {
    return false;
  }
}

export default async function Login({ searchParams }: LoginProps) {
  const params = await searchParams;
  const code = getSingleSearchParam(params.code);

  if (code) {
    const callbackParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      appendSearchParam(callbackParams, key, value);
    }

    redirect(`/api/auth/callback?${callbackParams.toString()}`);
  }

  const returnUrl = getSingleSearchParam(params.returnUrl);
  const multiAccount = getSingleSearchParam(params.multiAccount) === 'true';
  const authenticatedRedirectPath = getAuthenticatedLoginRedirectPath(params);
  const shouldCheckAuthenticatedSession =
    Boolean(authenticatedRedirectPath) || Boolean(returnUrl && !multiAccount);
  const authenticatedSession = shouldCheckAuthenticatedSession
    ? await hasAuthenticatedSession()
    : false;

  if (authenticatedRedirectPath && authenticatedSession) {
    redirect(authenticatedRedirectPath);
  }

  const deferAuthSurfaceUntilSessionCheck = Boolean(
    authenticatedSession &&
      returnUrl &&
      !multiAccount &&
      !getSafeLocalRedirectPath(returnUrl)
  );

  const returnUrlDomain = getReturnUrlDomain(returnUrl);

  const currentDomain = returnUrlDomain
    ? Object.values(DOMAINS).find((domain) =>
        domain.href.includes(returnUrlDomain)
      )
    : DOMAINS.TUTURUUU;
  const localE2EAuthBypass = isLocalE2EAuthBypassEnabled();

  return (
    <LoginContent
      currentDomain={currentDomain ?? null}
      deferAuthSurfaceUntilSessionCheck={deferAuthSurfaceUntilSessionCheck}
      localE2EAuthBypass={localE2EAuthBypass}
      multiAccount={multiAccount}
      runtimeSupabaseConfig={
        localE2EAuthBypass ? getLocalE2ESupabaseBrowserConfig() : null
      }
      tuturuuuDomain={DOMAINS.TUTURUUU}
    />
  );
}

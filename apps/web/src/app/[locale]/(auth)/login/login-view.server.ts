import type { LoginViewResponse } from '@tuturuuu/internal-api/auth';
import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { externalAppLogoPath } from '@/lib/app-coordination/external-app-logo';
import { getExternalAppByReturnUrl } from '@/lib/app-coordination/external-apps';
import {
  matchesRegisteredCallbackPath,
  parseCrossAppPkceChallenge,
} from '@/lib/auth/cross-app-pkce';
import { peekWebAccounts } from '@/lib/auth/multi-account/vault';
import { readProviderHint } from './login-view';

type RequestLike = Pick<Request, 'headers' | 'url'>;

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

type SessionRead = {
  session: LoginViewResponse['session'];
  status: LoginViewResponse['sessionStatus'];
};

async function readSession(): Promise<SessionRead> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!user) {
      // A missing session is a definitive answer; any other failure is not.
      const absent = !error || error.name === 'AuthSessionMissingError';
      if (!absent) {
        console.warn('[login] Could not read the session for the login view', {
          error: error.message,
        });
      }
      return { session: null, status: absent ? 'absent' : 'unknown' };
    }

    const { data: profile } = await supabase
      .from('users')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    const metadata = user.user_metadata ?? {};

    return {
      status: 'present',
      session: {
        id: user.id,
        avatarUrl:
          readString(profile?.avatar_url) ??
          readString(metadata.avatar_url) ??
          readString(metadata.picture),
        name:
          readString(profile?.display_name) ??
          readString(metadata.full_name) ??
          readString(metadata.name),
      },
    };
  } catch (error) {
    console.warn('[login] Could not read the session for the login view', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { session: null, status: 'unknown' };
  }
}

async function readSavedAccounts(
  request: RequestLike
): Promise<LoginViewResponse['savedAccounts']> {
  try {
    const { accounts } = await peekWebAccounts(request);
    // Only what the chooser renders; navigation history stays server-side.
    return accounts.map((account) => ({
      email: account.email,
      id: account.id,
      metadata: {
        addedAt: null,
        avatarUrl: account.metadata.avatarUrl,
        displayName: account.metadata.displayName,
        lastActiveAt: null,
        lastRoute: null,
        lastWorkspaceId: null,
      },
    }));
  } catch (error) {
    console.warn('[login] Failed to read saved accounts for the login view', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

/** Decodes only an encoded outer URL, as the cross-app return route does. */
function decodeOuterReturnUrl(returnUrl: string) {
  if (!/^https?%3a/i.test(returnUrl)) return returnUrl;
  try {
    return decodeURIComponent(returnUrl);
  } catch {
    return returnUrl;
  }
}

/**
 * Only a registry-validated external app (origin and callback path) names
 * the return target; a label in the query never does.
 *
 * `autoContinue` lets an existing session continue without a click. It holds
 * only for a strictly registered app: exact callback paths (no legacy
 * origin-only match), required S256 PKCE, and a valid S256 challenge on this
 * very request, so the handoff token can only be redeemed by the browser
 * that started the sign-in.
 */
async function readReturnApp(
  returnUrl: string | null,
  params: URLSearchParams
): Promise<LoginViewResponse['returnApp']> {
  if (!returnUrl || returnUrl.length > MAX_URL_LENGTH) return null;

  try {
    const decoded = decodeOuterReturnUrl(returnUrl);
    const app = await getExternalAppByReturnUrl(decoded);
    if (!app || !matchesRegisteredCallbackPath(decoded, app.callbackPaths)) {
      return null;
    }
    const challenge = parseCrossAppPkceChallenge({
      codeChallenge: params.get('code_challenge'),
      codeChallengeMethod: params.get('code_challenge_method'),
    });
    return {
      autoContinue:
        app.requirePkce === true &&
        app.callbackPaths.length > 0 &&
        Boolean(challenge),
      id: app.id,
      logo: app.logoUrl ? externalAppLogoPath(app.id) : null,
      name: app.displayName,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the login view for the browser through a private, no-store
 * route, so the cacheable login shell never carries a visitor's identity.
 * The session read is the single seam a provider-agnostic principal lookup
 * replaces.
 */
export async function resolveLoginView(
  request: RequestLike
): Promise<LoginViewResponse> {
  const params = new URL(request.url).searchParams;
  const [{ session, status }, savedAccounts, returnApp] = await Promise.all([
    readSession(),
    readSavedAccounts(request),
    readReturnApp(params.get('returnUrl'), params),
  ]);

  return {
    hasSession: status === 'present',
    providerHint: readProviderHint(params.get('provider')),
    returnApp,
    savedAccounts,
    session,
    sessionStatus: status,
  };
}

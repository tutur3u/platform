import { createClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { peekWebAccounts } from '@/lib/auth/multi-account/vault';
import { type InitialLoginView, readProviderHint } from './login-view';

type LoginSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function readHasSession() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

async function readSavedAccounts(): Promise<InitialLoginView['savedAccounts']> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host') ?? 'localhost';
    const { accounts } = await peekWebAccounts({
      headers: requestHeaders,
      url: `https://${host}/login`,
    });
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

/**
 * Resolves the login view on the server so the first paint already matches
 * the request. The session read is the single seam a provider-agnostic
 * principal lookup replaces.
 */
export async function resolveInitialLoginView(
  searchParams: LoginSearchParams
): Promise<InitialLoginView> {
  const [hasSession, savedAccounts] = await Promise.all([
    readHasSession(),
    readSavedAccounts(),
  ]);

  return {
    hasSession,
    providerHint: readProviderHint(firstValue(searchParams.provider)),
    savedAccounts,
  };
}

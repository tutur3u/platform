'use client';

import { useEffect, useRef } from 'react';
import {
  AUTH_OAUTH_PROVIDERS,
  type AuthOAuthProvider,
} from '@/lib/auth/oauth-providers';

export function useAutoOAuthLogin(
  provider: string | null,
  enabled: boolean,
  handleOAuthLogin: (provider: AuthOAuthProvider) => Promise<void>
) {
  const attemptedProvider = useRef<AuthOAuthProvider | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (
      !provider ||
      !AUTH_OAUTH_PROVIDERS.includes(provider as AuthOAuthProvider)
    ) {
      attemptedProvider.current = null;
      return;
    }

    const oauthProvider = provider as AuthOAuthProvider;
    if (attemptedProvider.current === oauthProvider) return;

    attemptedProvider.current = oauthProvider;
    void handleOAuthLogin(oauthProvider);
  }, [enabled, handleOAuthLogin, provider]);
}

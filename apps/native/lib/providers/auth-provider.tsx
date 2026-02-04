import { type ReactNode, useEffect } from 'react';

import { useAuthStore } from '../stores/auth-store';

type AuthProviderProps = {
  children: ReactNode;
};

/**
 * Auth initialization provider
 *
 * Initializes the auth store on app start and sets up auth state listeners.
 * This should wrap the entire app to ensure auth is ready before rendering.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { initialize, isInitialized } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  return <>{children}</>;
}

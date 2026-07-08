import { connection } from 'next/server';
import { Suspense } from 'react';
import {
  getLocalE2ESupabaseBrowserConfig,
  isLocalE2EAuthBypassEnabled,
} from '@/lib/auth/local-e2e';
import { LoginContent } from './login-content';

function LoginShellFallback() {
  return <div className="min-h-screen bg-root-background" />;
}

export default async function Login() {
  await connection();

  const localE2EAuthBypass = isLocalE2EAuthBypassEnabled();

  return (
    <Suspense fallback={<LoginShellFallback />}>
      <LoginContent
        localE2EAuthBypass={localE2EAuthBypass}
        runtimeSupabaseConfig={
          localE2EAuthBypass ? getLocalE2ESupabaseBrowserConfig() : null
        }
      />
    </Suspense>
  );
}

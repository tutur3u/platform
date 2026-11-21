import { connection } from 'next/server';
import { Suspense } from 'react';
import {
  getLocalE2ESupabaseBrowserConfig,
  isLocalE2EAuthBypassEnabled,
} from '@/lib/auth/local-e2e';
import { LoginContent } from './login-content';
import { resolveInitialLoginView } from './login-view.server';

type LoginSearchParams = Record<string, string | string[] | undefined>;

function LoginShellFallback() {
  return <div className="min-h-screen bg-root-background" />;
}

export async function LoginView({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  await connection();
  const localE2EAuthBypass = isLocalE2EAuthBypassEnabled();
  const initialView = await resolveInitialLoginView(await searchParams);

  return (
    <LoginContent
      initialView={initialView}
      localE2EAuthBypass={localE2EAuthBypass}
      runtimeSupabaseConfig={
        localE2EAuthBypass ? getLocalE2ESupabaseBrowserConfig() : null
      }
    />
  );
}

export default function Login({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  return (
    <Suspense fallback={<LoginShellFallback />}>
      <LoginView searchParams={searchParams} />
    </Suspense>
  );
}

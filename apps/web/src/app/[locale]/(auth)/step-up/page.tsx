import { createClient } from '@tuturuuu/supabase/next/server';
import { requiresFreshPrimaryForMfa } from '@tuturuuu/utils/required-mfa-policy';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { StepUpClient } from './step-up-client';
import { passwordsStepUpTarget } from './target';

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ app?: string | string[]; next?: string | string[] }>;
};

export async function StepUpContent({ params, searchParams }: Props) {
  await connection();
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'vi') notFound();
  const query = await searchParams;
  const next = passwordsStepUpTarget(query.app, query.next);
  if (!next) notFound();
  const returnPath = `/${locale}/step-up?${new URLSearchParams({ app: 'passwords', next })}`;
  const loginPath = `/${locale}/login?${new URLSearchParams({ nextUrl: returnPath, mfa: 'required' })}`;
  const client = await createClient();
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) redirect(loginPath);
  const claims = await client.auth.getClaims();
  if (
    claims.error ||
    claims.data?.claims.sub !== user.data.user.id ||
    requiresFreshPrimaryForMfa(user.data.user.app_metadata, claims.data.claims)
  )
    redirect(loginPath);
  const t = await getTranslations({ locale, namespace: 'login' });
  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-12">
      <h1 className="font-semibold text-2xl">
        {t('two_factor_authentication')}
      </h1>
      <StepUpClient next={next} userId={user.data.user.id} />
    </main>
  );
}

export default function StepUpPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <StepUpContent {...props} />
    </Suspense>
  );
}

import { Check } from '@tuturuuu/icons/lucide-static';
import { SsoError } from '@tuturuuu/sso';
import { Button } from '@tuturuuu/ui/button';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  cookieName,
  csrfFor,
  handleSchema,
  unseal,
} from '@/lib/sso/browser-state';
import { configuration, enabled } from '@/lib/sso/config';
import { consentIdentity } from '@/lib/sso/identity';
import { adminClient } from '@/lib/sso/store';
import {
  ConfirmIdentityIllustration,
  ConsentIllustration,
  ExpiredLinkIllustration,
} from '../../login/auth-illustrations';
import { AuthStateCard } from '../../login/auth-state-card';
import { Reauthenticate } from './reauthenticate';

export default async function ConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ transaction?: string; denied?: string }>;
}) {
  await connection();
  if (!enabled()) notFound();
  const locale = (await params).locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({ locale, namespace: 'sso_consent' });
  const query = await searchParams;
  if (query.denied === '1') return <ConsentDenied title={t('denied')} />;
  const handle = handleSchema.safeParse(query.transaction);
  if (!handle.success) notFound();
  const config = configuration();
  const state = await unseal(
    (await cookies()).get(cookieName(handle.data))?.value,
    handle.data,
    config
  );
  const admin = await adminClient();
  let context: Awaited<ReturnType<typeof consentIdentity>>;
  try {
    context = await consentIdentity(
      new Request(config.origin, { headers: await headers() }),
      admin,
      config,
      state
    );
  } catch (error) {
    if (error instanceof SsoError && error.code === 'session_changed')
      return <ConsentDenied title={t('denied')} />;
    const returnPath = `/${locale}/sso/consent?transaction=${handle.data}`;
    const loginPath = `/${locale}/login?mfa=totp&nextUrl=${encodeURIComponent(returnPath)}`;
    return (
      <ConsentFrame>
        {error instanceof SsoError && error.code === 'mfa_required' ? (
          <Reauthenticate
            description={t('authentication_required')}
            loginPath={loginPath}
          />
        ) : (
          <AuthStateCard
            description={t('authentication_required')}
            illustration={<ConfirmIdentityIllustration />}
            title={t('title')}
            titleAs="h1"
          >
            <Button asChild className="h-12 w-full rounded-2xl font-bold">
              <a href={loginPath}>{t('sign_in')}</a>
            </Button>
          </AuthStateCard>
        )}
      </ConsentFrame>
    );
  }
  const appName = context.current.name;
  return (
    <ConsentFrame>
      <AuthStateCard
        illustration={<ConsentIllustration />}
        title={t('share_title', { name: appName })}
        titleAs="h1"
      >
        <p className="text-center text-muted-foreground text-sm">
          {t('description')}
        </p>
        <ul className="flex flex-col rounded-2xl border px-3.5 py-1">
          {CLAIM_KEYS.map((key) => (
            <li
              className="flex items-start gap-2.5 border-b py-2.5 text-sm last:border-b-0"
              key={key}
            >
              <Check
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-dynamic-green"
              />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t('each_login', { name: appName })}
        </p>
        <form
          method="post"
          action={`/api/v1/sso/transactions/${handle.data}/decision`}
          className="grid grid-cols-2 gap-2.5"
        >
          <input
            type="hidden"
            name="csrf"
            value={csrfFor(state, context.actor)}
          />
          <input type="hidden" name="locale" value={locale} />
          <Button
            type="submit"
            className="h-12 rounded-2xl font-bold"
            name="decision"
            value="deny"
            variant="outline"
          >
            {t('deny')}
          </Button>
          <Button
            type="submit"
            className="h-12 rounded-2xl font-bold"
            name="decision"
            value="approve"
          >
            {t('approve')}
          </Button>
        </form>
        <p className="text-center text-muted-foreground text-xs">
          {t('signed_in_as', { email: context.actor.email ?? '' })}{' '}
          <a
            className="font-semibold text-foreground underline underline-offset-4"
            href={locale === 'vi' ? '/vi/logout' : '/logout'}
          >
            {t('not_you')}
          </a>
        </p>
      </AuthStateCard>
    </ConsentFrame>
  );
}

const CLAIM_KEYS = ['subject', 'email', 'first_name', 'last_name'] as const;

/** The consent screens share the 400px auth column, centred on the page. */
function ConsentFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <div className="flex w-full max-w-[400px] flex-col gap-4">{children}</div>
    </main>
  );
}

function ConsentDenied({ title }: { title: string }) {
  return (
    <ConsentFrame>
      <AuthStateCard
        illustration={<ExpiredLinkIllustration />}
        title={title}
        titleAs="h1"
      />
    </ConsentFrame>
  );
}

import { SsoError } from '@tuturuuu/sso';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import {
  cookieName,
  csrfFor,
  handleSchema,
  unseal,
} from '@/lib/sso/browser-state';
import { configuration, enabled } from '@/lib/sso/config';
import { consentIdentity } from '@/lib/sso/identity';
import { adminClient } from '@/lib/sso/store';
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
  if (query.denied === '1')
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1>{t('denied')}</h1>
      </main>
    );
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
    const returnPath = `/${locale}/sso/consent?transaction=${handle.data}`;
    const loginPath = `/${locale}/login?mfa=required&nextUrl=${encodeURIComponent(returnPath)}`;
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="font-semibold text-xl">{t('title')}</h1>
        <p>{t('authentication_required')}</p>
        {error instanceof SsoError && error.code === 'mfa_required' ? (
          <Reauthenticate loginPath={loginPath} />
        ) : (
          <a className="underline" href={loginPath}>
            {t('sign_in')}
          </a>
        )}
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="font-semibold text-2xl">{t('title')}</h1>
      <p>{t('destination', { name: context.current.name })}</p>
      <p>{context.actor.email}</p>
      <p>{t('description')}</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>{t('subject')}</li>
        <li>{t('email')}</li>
        <li>{t('first_name')}</li>
        <li>{t('last_name')}</li>
      </ul>
      <p>{t('each_login')}</p>
      <form
        method="post"
        action={`/api/v1/sso/transactions/${handle.data}/decision`}
        className="flex gap-4"
      >
        <input
          type="hidden"
          name="csrf"
          value={csrfFor(state, context.actor)}
        />
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="rounded border bg-primary px-4 py-2 text-primary-foreground focus-visible:outline-2"
          name="decision"
          value="approve"
        >
          {t('approve')}
        </button>
        <button
          type="submit"
          className="rounded border px-4 py-2 focus-visible:outline-2"
          name="decision"
          value="deny"
        >
          {t('deny')}
        </button>
      </form>
    </main>
  );
}

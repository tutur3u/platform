import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { canUserLinkUpskii } from '@/lib/integrations/upskii/access';
import { auditLinkEvent } from '@/lib/integrations/upskii/link-service';
import { createExternalAccountLinkStore } from '@/lib/integrations/upskii/link-store';
import { liveClassStore } from '@/lib/integrations/upskii/live-class-store';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function consentPath(locale: string, linkId: string) {
  return `/${locale === 'vi' ? 'vi/' : ''}upskii/live-class-permission?link=${encodeURIComponent(linkId)}`;
}

async function currentSession() {
  return resolveAuthenticatedSessionUser(await createClient());
}

async function changePermission(
  locale: string,
  expectedLinkId: string,
  granted: boolean
) {
  'use server';
  const { user } = await currentSession();
  if (!user) redirect(consentPath(locale, expectedLinkId));

  const admin = await createAdminClient({ noCookie: true });
  const link = await createExternalAccountLinkStore(admin).findActiveByUser(
    user.id
  );
  if (!link || link.id !== expectedLinkId)
    redirect(consentPath(locale, expectedLinkId));
  if (
    granted &&
    (!(await canUserLinkUpskii(admin, user.id, {
      upskiiEmail: link.external_email,
    })) ||
      !(await canVerifiedAccountHostMeeting(user.id, user)))
  )
    redirect(consentPath(locale, expectedLinkId));

  await liveClassStore(admin).setGrant(link.id, granted);
  auditLinkEvent(granted ? 'meet-consent-granted' : 'meet-consent-revoked', {
    linkId: link.id,
    userId: user.id,
  });
  redirect(consentPath(locale, expectedLinkId));
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ link?: string | string[] }>;
};

export default function UpskiiLiveClassPermissionPage(props: Props) {
  return (
    <Suspense>
      <PermissionContent {...props} />
    </Suspense>
  );
}

async function PermissionContent({ params, searchParams }: Props) {
  await connection();
  const [{ locale }, search, { user }, t] = await Promise.all([
    params,
    searchParams,
    currentSession(),
    getTranslations('upskii-live-class-permission'),
  ]);
  const expectedLinkId =
    typeof search.link === 'string' && /^[0-9a-f-]{36}$/iu.test(search.link)
      ? search.link
      : '';
  if (!user && expectedLinkId) {
    const localePrefix = locale === 'vi' ? '/vi' : '';
    redirect(
      `${localePrefix}/login?nextUrl=${encodeURIComponent(consentPath(locale, expectedLinkId))}`
    );
  }

  const admin = await createAdminClient({ noCookie: true });
  const active = user
    ? await createExternalAccountLinkStore(admin).findActiveByUser(user.id)
    : null;
  const link = active?.id === expectedLinkId ? active : null;
  const entitled = Boolean(
    user &&
    link &&
    (await canUserLinkUpskii(admin, user.id, {
      upskiiEmail: link.external_email,
    })) &&
    (await canVerifiedAccountHostMeeting(user.id, user))
  );
  const granted = link ? await liveClassStore(admin).hasGrant(link.id) : false;

  return (
    <main className="mx-auto grid min-h-[60dvh] w-full max-w-lg place-items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p>{t(link ? 'description' : 'not_linked')}</p>
          {link?.external_email && (
            <p className="text-sm text-muted-foreground">
              {t('linked_as', { email: link.external_email })}
            </p>
          )}
          {link && !granted && !entitled && (
            <p className="text-sm text-muted-foreground">
              {t('hosting_unavailable')}
            </p>
          )}
          {link && (granted || entitled) && (
            <form
              action={changePermission.bind(null, locale, link.id, !granted)}
            >
              <p className="mb-3 text-sm text-muted-foreground" role="status">
                {t(granted ? 'granted' : 'not_granted')}
              </p>
              <Button type="submit" variant={granted ? 'outline' : 'default'}>
                {t(granted ? 'revoke' : 'allow')}
              </Button>
            </form>
          )}
          <Button asChild variant="link">
            <a href="https://app.upskii.com/settings/integrations">
              {t('back')}
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

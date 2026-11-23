import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import {
  getVisibleIntegrationStatus,
  integrationsCatalog,
  resolveIntegrationDestinationUrl,
} from '@tuturuuu/utils/integrations-catalog';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';
import { IntegrationsCatalog } from './integrations-catalog';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketing-integrations',
  pathname: '/integrations',
});

async function readStaffAccess() {
  const { user } = await resolveAuthenticatedSessionUser(await createClient());
  if (!user) return false;

  return isVerifiedTuturuuuStaffSession(
    await getVerifiedAuthUser(
      await createAdminClient({ noCookie: true }),
      user.id
    )
  );
}

async function IntegrationResults() {
  await connection();
  const [isStaff, locale] = await Promise.all([readStaffAccess(), getLocale()]);

  const entries = integrationsCatalog.map((entry) => {
    const status = getVisibleIntegrationStatus(entry.status, isStaff);
    const result = {
      id: entry.id,
      category: entry.category,
      group: entry.group,
      logo: 'logo' in entry ? entry.logo : undefined,
      status,
    };
    if (status === 'coming_soon' || !('destination' in entry)) return result;

    const href = resolveIntegrationDestinationUrl(entry.destination, {
      environment: 'production',
      locale,
    });
    return href ? { ...result, href } : result;
  });

  return <IntegrationsCatalog entries={entries} />;
}

function IntegrationsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-8">
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}

export default async function IntegrationsPage() {
  const t = await getTranslations('marketing-integrations');

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
      <header className="mb-8 max-w-2xl space-y-3">
        <h1 className="font-semibold text-4xl tracking-tight sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-base text-muted-foreground">{t('description')}</p>
      </header>
      <Suspense fallback={<IntegrationsSkeleton />}>
        <IntegrationResults />
      </Suspense>
    </main>
  );
}

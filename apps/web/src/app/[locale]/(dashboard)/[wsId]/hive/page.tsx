import { HIVE_REALTIME_URL } from '@tuturuuu/hive-ui/config';
import { HiveStudio } from '@tuturuuu/hive-ui/studio';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import { listHiveServers } from '@tuturuuu/internal-api/hive';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getHiveBuildInfo } from '@/lib/hive-build-info';
import { getWebHivePageContext } from '@/lib/hive-page-context';

export const metadata: Metadata = {
  title: 'Hive',
  description: 'Run Hive simulation and research worlds in Tuturuuu.',
};

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function HivePage({ params }: PageProps) {
  const { wsId } = await params;
  const context = await getWebHivePageContext(wsId);

  if (!context) notFound();

  if (!context.access) {
    redirect(`/${wsId}/hive/not-whitelisted`);
  }

  const initialServers = await listHiveServers(
    withForwardedInternalApiAuth(await headers())
  );

  return (
    <HiveStudio
      buildInfo={getHiveBuildInfo()}
      currentUser={context.access.user}
      initialServers={initialServers}
      isAdmin={context.access.isAdmin}
      realtimeUrl={HIVE_REALTIME_URL}
    />
  );
}

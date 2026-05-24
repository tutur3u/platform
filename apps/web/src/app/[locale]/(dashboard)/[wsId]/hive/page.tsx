import { HIVE_REALTIME_URL } from '@tuturuuu/hive-ui/config';
import { HiveStudio } from '@tuturuuu/hive-ui/studio';
import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import {
  type HiveServersResponse,
  listHiveServers,
} from '@tuturuuu/internal-api/hive';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getHiveBuildInfo } from '@/lib/hive-build-info';
import { getWebHivePageContext } from '@/lib/hive-page-context';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export const metadata: Metadata = {
  title: 'Hive',
  description: 'Run Hive simulation and research worlds in Tuturuuu.',
};

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams?: Promise<{
    panel?: string;
    serverId?: string;
    workflowId?: string;
  }>;
}

export default async function HivePage({ params, searchParams }: PageProps) {
  const { wsId } = await params;
  const query = (await searchParams) ?? {};
  const context = await getWebHivePageContext(wsId);

  if (!context) notFound();

  if (!context.access) {
    redirect(`/${wsId}/hive/not-whitelisted`);
  }

  let initialServers: HiveServersResponse;

  try {
    initialServers = await listHiveServers(
      withForwardedInternalApiAuth(await headers())
    );
  } catch (error) {
    if (!(error instanceof InternalApiError)) {
      throw error;
    }

    serverLogger.error('Failed to preload Hive servers', {
      code: error.code,
      message: error.message,
      status: error.status,
    });
    initialServers = {
      isAdmin: context.access.isAdmin,
      servers: [],
    };
  }

  return (
    <HiveStudio
      buildInfo={getHiveBuildInfo()}
      currentUser={context.access.user}
      embedInDashboard
      initialPanel={toHivePanel(query.panel)}
      initialServerId={query.serverId ?? null}
      initialServers={initialServers}
      initialWorkflowId={query.workflowId ?? null}
      isAdmin={context.access.isAdmin}
      realtimeUrl={HIVE_REALTIME_URL}
    />
  );
}

function toHivePanel(value: string | undefined) {
  return value === 'agents' ||
    value === 'timeline' ||
    value === 'workflows' ||
    value === 'world'
    ? value
    : null;
}

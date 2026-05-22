import { HiveAccessRequestCard } from '@tuturuuu/hive-ui/access';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getWebHivePageContext } from '@/lib/hive-page-context';

export const metadata: Metadata = {
  title: 'Hive Access',
  description: 'Request access to Hive inside Tuturuuu.',
};

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function HiveNotWhitelistedPage({ params }: PageProps) {
  const { wsId } = await params;
  const context = await getWebHivePageContext(wsId);

  if (!context) notFound();

  if (context.access) {
    redirect(`/${wsId}/hive`);
  }

  return (
    <HiveAccessRequestCard
      approvedRedirectPath={`/${wsId}/hive`}
      email={context.user.email ?? null}
      showLogout={false}
    />
  );
}

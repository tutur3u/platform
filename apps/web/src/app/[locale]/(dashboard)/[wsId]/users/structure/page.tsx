import type { Metadata } from 'next';
import { OrganizationalStructureDashboard } from './components/organizational-structure-dashboard';

export const metadata: Metadata = {
  title: 'Structure',
  description: 'Manage Structure in the Users area of your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function OrganizationalStructurePage({
  params,
}: PageProps) {
  const { wsId, locale } = await params;
  return <OrganizationalStructureDashboard wsId={wsId} locale={locale} />;
}

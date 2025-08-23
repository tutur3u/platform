import { OrganizationalStructureDashboard } from './components/organizational-structure-dashboard';

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

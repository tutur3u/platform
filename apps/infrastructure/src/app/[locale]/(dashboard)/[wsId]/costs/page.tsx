import { getAppProductionBaseUrl } from '@tuturuuu/utils/app-mounts';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import { CostsClient } from './costs-client';

const FINANCE_SUBDOMAIN_URL = resolveInternalAppUrl({
  appName: 'finance',
  candidates: [
    process.env.FINANCE_APP_URL,
    process.env.NEXT_PUBLIC_FINANCE_APP_URL,
  ],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://finance.tuturuuu.com'
      : getLocalInternalAppUrl('finance', 'http://localhost:7808'),
});

// Finance links follow its shared-origin mount (/finance) when it is active.
const FINANCE_APP_URL =
  process.env.NODE_ENV === 'production'
    ? getAppProductionBaseUrl('finance', FINANCE_SUBDOMAIN_URL)
    : FINANCE_SUBDOMAIN_URL;

// Spend and invoice details need both infrastructure and finance access.
export default async function CostsPage() {
  await connection();
  const access =
    await authorizeInfrastructureAdminRequest('view_finance_stats');
  if (
    !access.ok ||
    !access.permissions?.containsPermission('view_infrastructure')
  )
    notFound();
  return <CostsClient financeOrigin={FINANCE_APP_URL} />;
}

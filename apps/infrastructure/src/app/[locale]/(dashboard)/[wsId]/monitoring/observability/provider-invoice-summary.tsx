import type { Database } from '@tuturuuu/types/db';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getFormatter, getTranslations } from 'next-intl/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

type InvoiceSummaryRow = Pick<
  Database['private']['Tables']['external_provider_invoices']['Row'],
  | 'app_id'
  | 'provider'
  | 'account_id'
  | 'reference'
  | 'issued_on'
  | 'amount_usd'
>;

export async function ProviderInvoiceSummary() {
  const access =
    await authorizeInfrastructureAdminRequest('view_finance_stats');
  if (
    !access.ok ||
    !access.permissions?.containsPermission('view_infrastructure')
  )
    return null;

  const t = await getTranslations('blue-green-monitoring.providerInvoices');
  const format = await getFormatter();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 29);

  const { data, error } = await access.sbAdmin
    .schema('private')
    .from('external_provider_invoices')
    .select('app_id,provider,account_id,reference,issued_on,amount_usd')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .gte('issued_on', since.toISOString().slice(0, 10))
    .lte('issued_on', new Date().toISOString().slice(0, 10))
    .order('issued_on', { ascending: false })
    .order('provider')
    .order('app_id')
    .order('account_id')
    .order('reference')
    .limit(100);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">{t('title')}</h2>
      {error ? (
        <p role="alert">{t('failed')}</p>
      ) : data?.length ? (
        <table className="w-full text-start text-sm">
          <thead>
            <tr>
              <th scope="col">{t('date')}</th>
              <th scope="col">{t('provider')}</th>
              <th scope="col">{t('amount')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: InvoiceSummaryRow) => (
              <tr
                key={JSON.stringify([
                  row.app_id,
                  row.provider,
                  row.account_id,
                  row.reference,
                ])}
              >
                <td>{row.issued_on}</td>
                <td>{row.provider}</td>
                <td>
                  {format.number(row.amount_usd, {
                    style: 'currency',
                    currency: 'USD',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{t('empty')}</p>
      )}
    </section>
  );
}

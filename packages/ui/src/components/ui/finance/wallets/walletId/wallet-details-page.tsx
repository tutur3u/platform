import { Calendar, CreditCard, DollarSign, Wallet } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { InfiniteTransactionsList } from '@tuturuuu/ui/finance/transactions/infinite-transactions-list';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import 'dayjs/locale/vi';
import moment from 'moment';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Card } from '../../../card';
import WalletRoleAccessDialog from './wallet-role-access-dialog';

interface Props {
  wsId: string;
  walletId: string;
  locale: string;
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function WalletDetailsPage({
  wsId,
  walletId,
  locale,
}: Props) {
  const t = await getTranslations();

  const { withoutPermission, containsPermission } = await getPermissions({
    wsId,
  });
  const canManageRoles = !withoutPermission('manage_workspace_roles');

  // Transaction permissions
  const canUpdateTransactions = containsPermission('update_transactions');
  const canDeleteTransactions = containsPermission('delete_transactions');
  const canUpdateConfidentialTransactions = containsPermission(
    'update_confidential_transactions'
  );
  const canDeleteConfidentialTransactions = containsPermission(
    'delete_confidential_transactions'
  );
  const canViewConfidentialAmount = containsPermission(
    'view_confidential_amount'
  );
  const canViewConfidentialDescription = containsPermission(
    'view_confidential_description'
  );
  const canViewConfidentialCategory = containsPermission(
    'view_confidential_category'
  );
  const hasManageFinance = containsPermission('manage_finance');

  const { wallet } = await getData(wsId, walletId, hasManageFinance);

  if (!wallet) notFound();

  return (
    <div className="flex min-h-full w-full flex-col">
      <FeatureSummary
        pluralTitle={wallet.name || t('ws-wallets.plural')}
        singularTitle={wallet.name || t('ws-wallets.singular')}
        description={wallet.description || t('ws-wallets.description')}
        createTitle={t('ws-wallets.create')}
        createDescription={t('ws-wallets.create_description')}
      />
      <Separator className="my-4" />
      <div className="grid h-fit gap-4 md:grid-cols-2">
        <Card className="grid gap-4">
          <div className="grid h-fit gap-2 rounded-lg p-4">
            <div className="font-semibold text-lg">
              {t('invoices.basic-info')}
            </div>
            <Separator />
            <DetailItem
              icon={<Wallet className="h-5 w-5" />}
              label={t('wallet-data-table.name')}
              value={wallet.name}
            />
            <DetailItem
              icon={<DollarSign className="h-5 w-5" />}
              label={t('wallet-data-table.balance')}
              value={Intl.NumberFormat(locale, {
                style: 'currency',
                currency: 'VND',
              }).format(wallet.balance || 0)}
            />
            <DetailItem
              icon={<CreditCard className="h-5 w-5" />}
              label={t('wallet-data-table.type')}
              value={t(
                `wallet-data-table.${(wallet.type as 'CREDIT' | 'STANDARD').toLowerCase() as 'credit' | 'standard'}`
              )}
            />
            <DetailItem
              icon={<Calendar className="h-5 w-5" />}
              label={t('wallet-data-table.created_at')}
              value={
                wallet.created_at
                  ? moment(wallet.created_at).format('DD/MM/YYYY, HH:mm:ss')
                  : '-'
              }
            />
          </div>
        </Card>

        <Card className="grid h-full gap-4 p-4">
          <div className="grid h-full content-start gap-2">
            <div className="font-semibold text-lg">
              {t('wallet-data-table.description')}
            </div>
            <Separator />
            <p>{wallet.description || t('common.empty')}</p>
          </div>
        </Card>
      </div>
      <Separator className="my-4" />
      {canManageRoles && (
        <>
          <WalletRoleAccessDialog wsId={wsId} walletId={walletId} />
          <Separator className="my-4" />
        </>
      )}
      <Suspense
        fallback={
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        }
      >
        <InfiniteTransactionsList
          wsId={wsId}
          walletId={walletId}
          canUpdateTransactions={canUpdateTransactions}
          canDeleteTransactions={canDeleteTransactions}
          canUpdateConfidentialTransactions={canUpdateConfidentialTransactions}
          canDeleteConfidentialTransactions={canDeleteConfidentialTransactions}
          canViewConfidentialAmount={canViewConfidentialAmount}
          canViewConfidentialDescription={canViewConfidentialDescription}
          canViewConfidentialCategory={canViewConfidentialCategory}
        />
      </Suspense>
    </div>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return undefined;
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className="font-semibold">{label}:</span> {value}
    </div>
  );
}

async function getData(
  _wsId: string,
  walletId: string,
  hasManageFinance: boolean
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('*')
    .eq('id', walletId)
    .single();

  if (walletError) throw walletError;

  if (!hasManageFinance) {
    // Get user's role IDs
    const { data: userRoles } = await supabase
      .from('workspace_role_members')
      .select('role_id')
      .eq('user_id', user.id);

    const roleIds = (userRoles || []).map((r) => r.role_id);

    if (roleIds.length > 0) {
      // Get whitelisted wallet IDs
      const { data: whitelistData } = await supabase
        .from('workspace_role_wallet_whitelist')
        .select('wallet_id')
        .eq('wallet_id', walletId)
        .in('role_id', roleIds);

      if (!whitelistData || whitelistData.length === 0) {
        // No access
        return { wallet: null };
      }
    } else {
      // No roles, no access
      return { wallet: null };
    }
  }

  return { wallet };
}

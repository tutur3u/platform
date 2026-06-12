import { Calendar, CreditCard, DollarSign, Globe } from '@tuturuuu/icons';
import {
  getWallet,
  type InternalApiClientOptions,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import type { FinancePermissionRequestUser } from '@tuturuuu/ui/finance/shared/finance-permission-warning-dialog';
import { InfiniteTransactionsList } from '@tuturuuu/ui/finance/transactions/infinite-transactions-list';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import type { ExchangeRate } from '@tuturuuu/utils/exchange-rates';
import { getCurrencyLocale } from '@tuturuuu/utils/format';
import {
  getPermissions,
  getWorkspace,
  getWorkspaceConfig,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import 'dayjs/locale/vi';
import moment from 'moment';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Card } from '../../../card';
import { WalletCheckpointPanel } from '../checkpoints/wallet-checkpoint-panel';
import { WalletIconDisplay } from '../wallet-icon-display';
import { CreditWalletSummary } from './credit-wallet-summary';
import { WalletInterestSection } from './interest';
import {
  type WalletDetailsAction,
  WalletDetailsActions,
} from './wallet-details-actions';
import { WalletDetailsAmount } from './wallet-details-amount';
import WalletRoleAccessDialog from './wallet-role-access-dialog';

interface Props {
  wsId: string;
  walletId: string;
  searchParams: {
    action?: string;
    q: string;
    page: string;
    pageSize: string;
  };
  defaultCurrency?: string;
  internalApiOptions?: InternalApiClientOptions;
  permissions?: PermissionsResult;
  workspace?: {
    personal?: boolean | null;
  };
  permissionRequestUser?: FinancePermissionRequestUser | null;
}

export default async function WalletDetailsPage({
  wsId,
  walletId,
  searchParams,
  defaultCurrency,
  internalApiOptions,
  permissions,
  workspace,
  permissionRequestUser,
}: Props) {
  const [t, resolvedWorkspace, resolvedPermissions, resolvedDefaultCurrency] =
    await Promise.all([
      getTranslations(),
      workspace ? Promise.resolve(workspace) : getWorkspace(wsId),
      permissions ? Promise.resolve(permissions) : getPermissions({ wsId }),
      defaultCurrency
        ? Promise.resolve(defaultCurrency)
        : getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
    ]);
  if (!resolvedWorkspace || !resolvedPermissions) notFound();
  const { withoutPermission, containsPermission } = resolvedPermissions;
  const canManageRoles = !withoutPermission('manage_workspace_roles');

  // Transaction permissions
  const canUpdateTransactions = containsPermission('update_transactions');
  const canDeleteTransactions = containsPermission('delete_transactions');
  const canChangeFinanceWallets = containsPermission('change_finance_wallets');
  const canSetFinanceWalletsOnCreate = containsPermission(
    'set_finance_wallets_on_create'
  );
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
  const canUpdateWallets = containsPermission('update_wallets');
  const canCreateTransactions = containsPermission('create_transactions');
  const canCreateConfidentialTransactions = containsPermission(
    'create_confidential_transactions'
  );
  const canDeleteWallets = containsPermission('delete_wallets');
  const resolvedInternalApiOptions =
    internalApiOptions ?? withForwardedInternalApiAuth(await headers());

  let wallet: Wallet;
  try {
    wallet = await getWallet(wsId, walletId, resolvedInternalApiOptions);
  } catch {
    notFound();
  }

  const currency = wallet.currency || resolvedDefaultCurrency || 'USD';
  const workspaceCurrency = resolvedDefaultCurrency || 'USD';
  const initialAction = getInitialWalletAction(searchParams.action);

  // Fetch exchange rates for conversion display
  const exchangeRates = await getExchangeRates();

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <FeatureSummary
          pluralTitle={wallet.name || t('ws-wallets.plural')}
          singularTitle={wallet.name || t('ws-wallets.singular')}
          description={wallet.description || t('ws-wallets.description')}
          createTitle={t('ws-wallets.create')}
          createDescription={t('ws-wallets.create_description')}
          icon={
            <WalletIconDisplay
              icon={wallet.icon}
              imageSrc={wallet.image_src}
              size="lg"
            />
          }
        />
        <WalletDetailsActions
          wsId={wsId}
          walletId={walletId}
          wallet={wallet as Wallet}
          initialAction={initialAction}
          canUpdateWallets={canUpdateWallets}
          canCreateTransactions={canCreateTransactions}
          canCreateConfidentialTransactions={canCreateConfidentialTransactions}
          canChangeFinanceWallets={canChangeFinanceWallets}
          canSetFinanceWalletsOnCreate={canSetFinanceWalletsOnCreate}
          canDeleteWallets={canDeleteWallets}
          isPersonalWorkspace={!!resolvedWorkspace.personal}
          permissionRequestUser={permissionRequestUser}
        />
      </div>
      <Separator className="my-4" />
      {wallet.type === 'CREDIT' && (
        <>
          <CreditWalletSummary wsId={wsId} wallet={wallet as Wallet} />
          <Separator className="my-4" />
        </>
      )}
      <div className="grid h-fit gap-4 md:grid-cols-2">
        <Card className="grid gap-4">
          <div className="grid h-fit gap-2 rounded-lg p-4">
            <div className="font-semibold text-lg">
              {t('invoices.basic-info')}
            </div>
            <Separator />
            <DetailItem
              icon={
                <WalletIconDisplay
                  icon={wallet.icon}
                  imageSrc={wallet.image_src}
                  size="md"
                />
              }
              label={t('wallet-data-table.name')}
              value={wallet.name}
            />
            <DetailItem
              icon={<DollarSign className="h-5 w-5" />}
              label={t('wallet-data-table.balance')}
              value={
                <WalletDetailsAmount
                  auditedBalance={wallet.audit_balance}
                  auditStatus={wallet.audit_status}
                  auditVariance={wallet.audit_variance}
                  currency={currency}
                  exchangeRates={exchangeRates}
                  ledgerBalance={wallet.balance ?? 0}
                  primary={Intl.NumberFormat(getCurrencyLocale(currency), {
                    style: 'currency',
                    currency,
                  }).format(wallet.balance || 0)}
                  workspaceCurrency={workspaceCurrency}
                />
              }
            />
            <DetailItem
              icon={<Globe className="h-5 w-5" />}
              label={t('wallet-data-table.currency')}
              value={currency}
            />
            <DetailItem
              icon={<CreditCard className="h-5 w-5" />}
              label={t('wallet-data-table.type')}
              value={t(
                `wallet-data-table.${(wallet.type as 'CREDIT' | 'STANDARD').toLowerCase() as 'credit' | 'standard'}`
              )}
            />
            {wallet.type === 'CREDIT' && (
              <>
                <Separator className="my-1" />
                <div className="font-semibold text-sm">
                  {t('wallet-data-table.credit_details')}
                </div>
                <DetailItem
                  icon={<DollarSign className="h-5 w-5" />}
                  label={t('wallet-data-table.credit_limit')}
                  value={
                    wallet.limit != null ? (
                      <WalletDetailsAmount
                        primary={Intl.NumberFormat(
                          getCurrencyLocale(currency),
                          {
                            style: 'currency',
                            currency,
                          }
                        ).format(wallet.limit)}
                      />
                    ) : (
                      '-'
                    )
                  }
                />
                <DetailItem
                  icon={<Calendar className="h-5 w-5" />}
                  label={t('wallet-data-table.statement_date')}
                  value={
                    wallet.statement_date != null
                      ? t('wallet-data-table.day_of_month', {
                          day: wallet.statement_date,
                        })
                      : '-'
                  }
                />
                <DetailItem
                  icon={<Calendar className="h-5 w-5" />}
                  label={t('wallet-data-table.payment_date')}
                  value={
                    wallet.payment_date != null
                      ? t('wallet-data-table.day_of_month', {
                          day: wallet.payment_date,
                        })
                      : '-'
                  }
                />
                <Separator className="my-1" />
              </>
            )}
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
      {canManageRoles && !resolvedWorkspace.personal && (
        <>
          <WalletRoleAccessDialog wsId={wsId} walletId={walletId} />
          <Separator className="my-4" />
        </>
      )}
      <WalletCheckpointPanel
        wsId={wsId}
        walletId={walletId}
        walletName={wallet.name ?? t('ws-wallets.singular')}
        currency={currency}
        canUpdateWallets={canUpdateWallets}
        canCreateTransactions={canCreateTransactions}
      />
      <Separator className="my-4" />
      {/* Interest Tracking Section - for Momo/ZaloPay wallets */}
      <WalletInterestSection wsId={wsId} wallet={wallet as Wallet} />
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
          currency={currency}
          canCreateTransactions={canCreateTransactions}
          canCreateConfidentialTransactions={canCreateConfidentialTransactions}
          canUpdateTransactions={canUpdateTransactions}
          canDeleteTransactions={canDeleteTransactions}
          canUpdateConfidentialTransactions={canUpdateConfidentialTransactions}
          canDeleteConfidentialTransactions={canDeleteConfidentialTransactions}
          canViewConfidentialAmount={canViewConfidentialAmount}
          canViewConfidentialDescription={canViewConfidentialDescription}
          canViewConfidentialCategory={canViewConfidentialCategory}
          isPersonalWorkspace={!!resolvedWorkspace.personal}
          permissionRequestUser={permissionRequestUser}
        />
      </Suspense>
    </div>
  );
}

function getInitialWalletAction(action?: string): WalletDetailsAction | null {
  switch (action) {
    case 'charge':
    case 'payment':
    case 'credit':
    case 'edit':
      return action;
    default:
      return null;
  }
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
    <div className="flex min-w-0 items-start gap-3 rounded-md py-1.5">
      <span className="mt-0.5 flex shrink-0 text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="min-w-0 font-medium">{value}</div>
      </div>
    </div>
  );
}

async function getExchangeRates(): Promise<ExchangeRate[]> {
  try {
    const supabase = await createAdminClient({ noCookie: true });
    const { data } = await supabase
      .from('currency_exchange_rates')
      .select('base_currency, target_currency, rate, date')
      .eq('base_currency', 'USD')
      .order('date', { ascending: false })
      .limit(30);
    return (data || []).map((r) => ({
      base_currency: r.base_currency,
      target_currency: r.target_currency,
      rate: Number(r.rate),
      date: r.date,
    }));
  } catch {
    return [];
  }
}

'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Check,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
  X,
} from '@tuturuuu/icons';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { WalletRowActions } from '@tuturuuu/ui/finance/wallets/row-actions';
import type { ExchangeRate } from '@tuturuuu/utils/exchange-rates';
import { convertCurrency } from '@tuturuuu/utils/exchange-rates';
import { cn, formatCurrency } from '@tuturuuu/utils/format';
import moment from 'moment';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { FinanceBalanceMode } from '../shared/use-finance-balance-mode';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';
import {
  getWalletBalanceTone,
  resolveWalletBalanceForMode,
} from '../shared/wallet-balance-mode';
import { WalletIconDisplay } from './wallet-icon-display';

interface WalletExtraData {
  balanceMode?: FinanceBalanceMode;
  canUpdateWallets?: boolean;
  canDeleteWallets?: boolean;
  currency?: string;
  exchangeRates?: ExchangeRate[];
  isPersonalWorkspace?: boolean;
}

function getAmountBadgeClassName(
  tone: ReturnType<typeof getWalletBalanceTone>
) {
  if (tone === 'positive') {
    return 'border-dynamic-green/30 bg-dynamic-green/10 font-semibold text-dynamic-green';
  }

  if (tone === 'negative') {
    return 'border-dynamic-red/30 bg-dynamic-red/10 font-semibold text-dynamic-red';
  }

  return 'font-semibold text-muted-foreground';
}

function AmountBadge({
  children,
  icon,
  label,
  tone,
}: {
  children: ReactNode;
  icon?: ReactNode;
  label?: string;
  tone: ReturnType<typeof getWalletBalanceTone>;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'flex w-fit items-center gap-1 whitespace-nowrap',
        getAmountBadgeClassName(tone)
      )}
    >
      {icon}
      {label && <span className="font-medium opacity-75">{label}</span>}
      <span>{children}</span>
    </Badge>
  );
}

function WalletBalanceCell({
  balanceMode,
  wallet,
  walletCurrency,
  workspaceCurrency,
  exchangeRates,
}: {
  balanceMode: FinanceBalanceMode;
  wallet: Wallet;
  walletCurrency: string;
  workspaceCurrency: string;
  exchangeRates?: ExchangeRate[];
}) {
  const t = useTranslations('wallet-checkpoints');
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const {
    auditStatus,
    auditVariance,
    contextBalance,
    displayBalance,
    hasAuditedBalance,
    isAuditedMode,
  } = resolveWalletBalanceForMode(wallet, balanceMode);
  const contextLabel = isAuditedMode ? t('ledger') : t('audited');
  const showAuditContext =
    hasAuditedBalance &&
    auditStatus &&
    auditStatus !== 'clean' &&
    auditStatus !== 'no_checkpoint' &&
    auditVariance !== null &&
    auditVariance !== 0;

  const formattedBalance = formatCurrency(
    displayBalance,
    walletCurrency,
    undefined,
    {
      signDisplay: 'auto',
    }
  );

  let convertedText: string | null = null;
  if (
    walletCurrency !== workspaceCurrency &&
    exchangeRates &&
    exchangeRates.length > 0 &&
    displayBalance !== 0
  ) {
    const converted = convertCurrency(
      displayBalance,
      walletCurrency,
      workspaceCurrency,
      exchangeRates
    );
    if (converted !== null) {
      convertedText = formatCurrency(
        Math.abs(converted),
        workspaceCurrency,
        undefined,
        { signDisplay: 'never', maximumFractionDigits: 0 }
      );
    }
  }

  if (areNumbersHidden) {
    return (
      <Badge variant="outline" className="font-semibold text-muted-foreground">
        {FINANCE_HIDDEN_AMOUNT}
      </Badge>
    );
  }

  const balanceTone = getWalletBalanceTone(displayBalance);
  const varianceTone = getWalletBalanceTone(auditVariance ?? 0);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <AmountBadge
          tone={balanceTone}
          icon={
            balanceTone === 'positive' ? (
              <TrendingUp className="h-3 w-3" />
            ) : balanceTone === 'negative' ? (
              <TrendingDown className="h-3 w-3" />
            ) : undefined
          }
        >
          {formattedBalance}
        </AmountBadge>
        {showAuditContext && typeof contextBalance === 'number' && (
          <>
            <AmountBadge
              tone={getWalletBalanceTone(contextBalance)}
              icon={<WalletIcon className="h-3 w-3" />}
              label={contextLabel}
            >
              {formatCurrency(contextBalance, walletCurrency, undefined, {
                signDisplay: 'auto',
              })}
            </AmountBadge>
            <AmountBadge
              tone={varianceTone}
              icon={
                varianceTone === 'negative' ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <TrendingUp className="h-3 w-3" />
                )
              }
              label={t('variance')}
            >
              {formatCurrency(auditVariance ?? 0, walletCurrency, undefined, {
                signDisplay: 'always',
              })}
            </AmountBadge>
          </>
        )}
      </div>
      {convertedText && (
        <span className="text-muted-foreground text-xs">
          {'\u2248'} {convertedText}
        </span>
      )}
      {isAuditedMode && auditStatus === 'no_checkpoint' && (
        <span className="text-muted-foreground text-xs">
          {t('no_checkpoint_short')}
        </span>
      )}
    </div>
  );
}

export const walletColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<Wallet> & {
  extraData?: WalletExtraData;
}): ColumnDef<Wallet>[] => {
  const workspaceCurrency = extraData?.currency || 'USD';
  const balanceMode = extraData?.balanceMode ?? 'ledger';

  return [
    // {
    //   id: 'select',
    //   header: ({ table }) => (
    //     <Checkbox
    //       checked={table.getIsAllPageRowsSelected()}
    //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    //       aria-label="Select all"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   cell: ({ row }) => (
    //     <Checkbox
    //       checked={row.getIsSelected()}
    //       onCheckedChange={(value) => row.toggleSelected(!!value)}
    //       aria-label="Select row"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   enableSorting: false,
    //   enableHiding: false,
    // },
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.id`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">{row.getValue('id')}</div>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.name`)}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <WalletIconDisplay
            icon={row.original.icon}
            imageSrc={row.original.image_src}
            size="sm"
          />
          <Link
            href={row.original.href || '#'}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold hover:underline"
          >
            {row.getValue('name') || '-'}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.description`)}
        />
      ),
      cell: ({ row }) => <div>{row.getValue('description') || '-'}</div>,
    },
    {
      id: 'balance',
      accessorFn: (wallet) =>
        resolveWalletBalanceForMode(wallet, balanceMode).displayBalance,
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.balance`)}
        />
      ),
      cell: ({ row }) => {
        const walletCurrency = row.original.currency || workspaceCurrency;
        return (
          <WalletBalanceCell
            balanceMode={balanceMode}
            wallet={row.original}
            walletCurrency={walletCurrency}
            workspaceCurrency={workspaceCurrency}
            exchangeRates={extraData?.exchangeRates}
          />
        );
      },
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.type`)}
        />
      ),
      cell: ({ row }) => {
        const type = row.getValue('type') as string;
        if (!type) return <div>-</div>;
        const isCredit = type === 'CREDIT';
        return (
          <Badge
            variant="outline"
            className={cn(
              'flex w-fit items-center gap-1',
              isCredit
                ? 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple'
                : 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
            )}
          >
            {isCredit ? (
              <CreditCard className="h-3 w-3" />
            ) : (
              <WalletIcon className="h-3 w-3" />
            )}
            {t(`${namespace}.${type.toLowerCase()}`)}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'currency',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.currency`)}
        />
      ),
      cell: ({ row }) => <div>{row.getValue('currency') || '-'}</div>,
    },
    {
      accessorKey: 'report_opt_in',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.report_opt_in`)}
        />
      ),
      cell: ({ row }) => (
        <div>{row.getValue('report_opt_in') ? <Check /> : <X />}</div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.created_at`)}
        />
      ),
      cell: ({ row }) => (
        <div>
          {row.getValue('created_at')
            ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <WalletRowActions
          row={row}
          href={row.original.href}
          canUpdateWallets={extraData?.canUpdateWallets}
          canDeleteWallets={extraData?.canDeleteWallets}
          isPersonalWorkspace={extraData?.isPersonalWorkspace}
        />
      ),
    },
  ];
};

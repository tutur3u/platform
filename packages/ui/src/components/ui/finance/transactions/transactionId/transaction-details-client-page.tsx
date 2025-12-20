'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarIcon,
  DollarSign,
  Edit,
  FolderOpen,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import moment from 'moment';
import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { TransactionEditDialog } from '../transaction-edit-dialog';
import { Bill } from './bill';
import { DetailObjects } from './objects';

interface Props {
  wsId: string;
  transaction: any;
  tags: Array<{ id: string; name: string; color: string }>;
  objects: any[];
}

export function TransactionDetailsClientPage({
  wsId,
  transaction,
  tags,
  objects,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const isExpense = (transaction.amount || 0) < 0;
  const transactionType = isExpense
    ? t('transaction-data-table.expense')
    : t('transaction-data-table.income');

  return (
    <>
      {/* Transaction type and amount header */}
      <Card
        className={`mb-4 border-2 ${
          isExpense
            ? 'border-dynamic-red/20 bg-linear-to-br from-dynamic-red/5 to-dynamic-red/10'
            : 'border-dynamic-green/20 bg-linear-to-br from-dynamic-green/5 to-dynamic-green/10'
        }`}
      >
        <div className="flex items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                isExpense ? 'bg-dynamic-red/15' : 'bg-dynamic-green/15'
              }`}
            >
              {isExpense ? (
                <TrendingDown className="h-8 w-8 text-dynamic-red" />
              ) : (
                <TrendingUp className="h-8 w-8 text-dynamic-green" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant={isExpense ? 'destructive' : 'default'}
                  className="font-medium"
                >
                  {transactionType}
                </Badge>
                {transaction.category && (
                  <Badge variant="outline">{transaction.category}</Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                {transaction.description || t('ws-transactions.no_description')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div
                className={`font-bold text-3xl tabular-nums ${
                  isExpense ? 'text-dynamic-red' : 'text-dynamic-green'
                }`}
              >
                {Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: 'VND',
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                  signDisplay: 'always',
                }).format(transaction.amount || 0)}
              </div>
              <p className="text-muted-foreground text-sm">
                {transaction.taken_at
                  ? moment(transaction.taken_at).format('DD/MM/YYYY, HH:mm')
                  : '-'}
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditOpen(true)}
              className="gap-2"
            >
              <Edit className="h-4 w-4" />
              {t('ws-transactions.edit')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid h-fit gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="space-y-0 bg-linear-to-br from-primary/5 to-primary/10 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">
                  {t('invoices.basic-info')}
                </h2>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <DetailItem
                icon={<Wallet className="h-5 w-5 text-primary" />}
                label={t('transaction-data-table.wallet')}
                value={transaction?.wallet_name}
                href={`/${wsId}/finance/wallets/${transaction?.wallet_id}`}
              />

              <Separator />

              <DetailItem
                icon={<User className="h-5 w-5 text-primary" />}
                label={t('transaction-data-table.user')}
                value={
                  transaction.workspace_users ? (
                    <div className="inline-flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
                      {transaction.workspace_users.avatar_url && (
                        <Image
                          src={
                            transaction.workspace_users.avatar_url ||
                            '/placeholder.svg'
                          }
                          alt={
                            transaction.workspace_users.full_name ||
                            'User avatar'
                          }
                          width={24}
                          height={24}
                          className="rounded-full object-cover ring-2 ring-border"
                        />
                      )}
                      <div className="flex min-w-0 flex-col">
                        {transaction.workspace_users.full_name && (
                          <span className="truncate font-medium text-sm leading-tight">
                            {transaction.workspace_users.full_name}
                          </span>
                        )}
                        {transaction.workspace_users.email && (
                          <span className="truncate text-muted-foreground text-xs leading-tight">
                            {transaction.workspace_users.email}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    '-'
                  )
                }
              />

              <Separator />

              <DetailItem
                icon={<FolderOpen className="h-5 w-5 text-primary" />}
                label={t('transaction-data-table.category')}
                value={
                  transaction?.category ? (
                    <Badge variant="secondary">{transaction.category}</Badge>
                  ) : (
                    '-'
                  )
                }
              />

              <Separator />

              <DetailItem
                icon={<CalendarIcon className="h-5 w-5 text-primary" />}
                label={t('transaction-data-table.taken_at')}
                value={
                  transaction.taken_at ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {moment(transaction.taken_at).format('DD/MM/YYYY')}
                      </Badge>
                      <span className="text-muted-foreground text-sm">
                        {moment(transaction.taken_at).format('HH:mm:ss')}
                      </span>
                    </div>
                  ) : (
                    '-'
                  )
                }
              />

              {tags && tags.length > 0 && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3 pt-1">
                    <Tag className="mt-1 h-5 w-5 shrink-0 text-primary" />
                    <div className="flex flex-1 flex-col gap-2">
                      <span className="font-semibold text-sm">
                        {t('transaction-data-table.tags')}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant="outline"
                            className="font-medium"
                            style={{
                              borderColor: tag.color,
                              color: tag.color,
                              backgroundColor: `${tag.color}15`,
                            }}
                          >
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>

          {objects.length > 0 && (
            <DetailObjects
              wsId={wsId}
              transactionId={transaction.id}
              objects={objects}
            />
          )}
        </div>

        <Card className="h-fit overflow-hidden">
          <div className="space-y-0 bg-linear-to-br from-primary/5 to-primary/10 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                {isExpense ? (
                  <ArrowDownCircle className="h-4 w-4 text-primary" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4 text-primary" />
                )}
              </div>
              <h2 className="font-semibold text-base">
                {t('ai_chat.upload_files')}
              </h2>
            </div>
          </div>
          <div className="p-4">
            <Bill wsId={wsId} transactionId={transaction.id} />
          </div>
        </Card>
      </div>

      <TransactionEditDialog
        transaction={transaction}
        wsId={wsId}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />
    </>
  );
}

function DetailItem({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  if (!value) return undefined;

  const content = (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </span>
        <div className="text-foreground text-sm">{value}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group rounded-lg p-2 transition-colors hover:bg-muted/50"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-lg p-2">{content}</div>;
}

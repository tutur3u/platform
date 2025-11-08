'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  FileText,
  Lock,
  Minus,
} from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { ConfidentialAmount } from '@tuturuuu/ui/finance/transactions/confidential-field';
import moment from 'moment';
import { useLocale, useTranslations } from 'next-intl';

interface TransactionCardProps {
  transaction: Transaction & {
    creator?: {
      full_name: string;
      email: string;
      avatar_url: string | null;
    } | null;
  };
  wsId: string;
}

export function TransactionCard({ transaction }: TransactionCardProps) {
  const locale = useLocale();
  const t = useTranslations('workspace-finance-transactions');
  const isExpense = (transaction.amount || 0) < 0;

  // Check if transaction is confidential
  const isConfidential =
    (transaction as any).is_amount_confidential ||
    (transaction as any).is_description_confidential ||
    (transaction as any).is_category_confidential;

  return (
    <Card className="group cursor-pointer border-dynamic-gray/20 bg-dynamic-gray/10 transition-all hover:border-primary/50 hover:shadow-md">
      <div className="flex items-center gap-4 p-4">
        {/* Icon and amount - Neutral for confidential */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isConfidential
                ? 'bg-dynamic-orange/10'
                : isExpense
                  ? 'bg-dynamic-red/10'
                  : 'bg-dynamic-green/10'
            }`}
          >
            {isConfidential ? (
              <Lock className="h-6 w-6 text-dynamic-orange" />
            ) : isExpense ? (
              <ArrowDownCircle className="h-6 w-6 text-dynamic-red" />
            ) : (
              <ArrowUpCircle className="h-6 w-6 text-dynamic-green" />
            )}
          </div>
        </div>

        {/* Transaction details */}
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col items-start justify-start gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {transaction.category && (
                  <Badge variant="outline" className="font-medium text-xs">
                    {transaction.category}
                  </Badge>
                )}
                {isConfidential && (
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange text-xs"
                  >
                    <Lock className="h-2.5 w-2.5" />
                    {t('confidential')}
                  </Badge>
                )}
              </div>
              {transaction.description && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{transaction.description}</span>
                </div>
              )}
            </div>

            <ConfidentialAmount
              amount={transaction.amount}
              isConfidential={(transaction as any).is_amount_confidential}
              className={`font-bold text-lg tabular-nums ${
                isConfidential
                  ? 'text-dynamic-orange'
                  : isExpense
                    ? 'text-dynamic-red'
                    : 'text-dynamic-green'
              }`}
            />
          </div>

          <div className="flex items-center gap-4 text-muted-foreground text-xs">
            {transaction.wallet && (
              <span className="font-medium">{transaction.wallet}</span>
            )}
            {transaction.taken_at && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{moment(transaction.taken_at).format('DD/MM/YYYY')}</span>
              </div>
            )}
            {transaction.creator && (
              <div className="flex items-center gap-1.5">
                <Avatar className="h-4 w-4">
                  <AvatarImage
                    src={transaction.creator.avatar_url || undefined}
                  />
                  <AvatarFallback className="text-[8px]">
                    {transaction.creator.full_name?.[0] ||
                      transaction.creator.email?.[0] ||
                      '?'}
                  </AvatarFallback>
                </Avatar>
                <span>
                  {transaction.creator.full_name || transaction.creator.email}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

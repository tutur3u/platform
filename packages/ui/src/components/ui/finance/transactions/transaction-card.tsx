'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  FileText,
  Lock,
  MoreVertical,
  Pencil,
  Trash2,
} from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ConfidentialAmount } from '@tuturuuu/ui/finance/transactions/confidential-field';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TransactionCardProps {
  transaction: Transaction & {
    creator?: {
      full_name: string;
      email: string;
      avatar_url: string | null;
    } | null;
  };
  wsId: string;
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function TransactionCard({
  transaction,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: TransactionCardProps) {
  const t = useTranslations('workspace-finance-transactions');
  const [isHovered, setIsHovered] = useState(false);
  const isExpense = (transaction.amount || 0) < 0;

  // Check if transaction is confidential
  const isConfidential =
    transaction.is_amount_confidential ||
    transaction.is_description_confidential ||
    transaction.is_category_confidential;

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg',
        isConfidential
          ? 'border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/5 to-transparent'
          : isExpense
            ? 'border-dynamic-red/20 bg-linear-to-br from-dynamic-red/5 to-transparent hover:border-dynamic-red/40'
            : 'border-dynamic-green/20 bg-linear-to-br from-dynamic-green/5 to-transparent hover:border-dynamic-green/40'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Accent bar on left */}
      <div
        className={cn(
          'absolute top-0 bottom-0 left-0 w-1 transition-all duration-200',
          isConfidential
            ? 'bg-dynamic-orange'
            : isExpense
              ? 'bg-dynamic-red'
              : 'bg-dynamic-green',
          isHovered ? 'w-1.5' : 'w-1'
        )}
      />

      <div className="flex items-start gap-4 p-4 pl-5">
        {/* Left section: Icon and main info */}
        <div className="flex flex-1 gap-4">
          {/* Icon */}
          <div className="shrink-0">
            <div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200',
                'shadow-sm ring-1 ring-black/5',
                isConfidential
                  ? 'bg-linear-to-br from-dynamic-orange/20 to-dynamic-orange/10'
                  : isExpense
                    ? 'bg-linear-to-br from-dynamic-red/20 to-dynamic-red/10'
                    : 'bg-linear-to-br from-dynamic-green/20 to-dynamic-green/10',
                isHovered && 'scale-105 shadow-md'
              )}
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
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Top row: Category and badges */}
            <div className="flex flex-wrap items-center gap-2">
              {transaction.category && (
                <Badge
                  variant="outline"
                  className={cn(
                    'font-semibold text-xs transition-colors',
                    isConfidential
                      ? 'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange'
                      : isExpense
                        ? 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red'
                        : 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green'
                  )}
                >
                  {transaction.category}
                </Badge>
              )}
              {isConfidential && (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 border-dynamic-orange/40 bg-dynamic-orange/5 text-dynamic-orange text-xs"
                >
                  <Lock className="h-2.5 w-2.5" />
                  {t('confidential')}
                </Badge>
              )}
            </div>

            {/* Description */}
            {transaction.description && (
              <div className="flex items-start gap-2 text-foreground/80">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="line-clamp-2 text-sm leading-relaxed">
                  {transaction.description}
                </p>
              </div>
            )}

            {/* Bottom metadata row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
              {transaction.wallet && (
                <div className="flex items-center gap-1.5 font-medium">
                  <div className="h-1 w-1 rounded-full bg-current" />
                  <span>{transaction.wallet}</span>
                </div>
              )}
              {transaction.taken_at && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {moment(transaction.taken_at).format('DD/MM/YYYY')}
                  </span>
                </div>
              )}
              {transaction.user && (
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-4 w-4 ring-1 ring-border">
                    <AvatarImage
                      src={transaction.user.avatar_url || undefined}
                    />
                    <AvatarFallback className="text-[8px]">
                      {transaction.user.full_name?.[0] ||
                        transaction.user.email?.[0] ||
                        '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">
                    {transaction.user.full_name || transaction.user.email}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right section: Amount and actions */}
        <div className="flex shrink-0 items-start gap-3">
          {/* Amount */}
          <div className="text-right">
            <ConfidentialAmount
              amount={transaction.amount ?? null}
              isConfidential={transaction.is_amount_confidential || false}
              className={cn(
                'font-bold text-xl tabular-nums transition-all duration-200',
                isConfidential
                  ? 'text-dynamic-orange'
                  : isExpense
                    ? 'text-dynamic-red'
                    : 'text-dynamic-green',
                isHovered && 'scale-105'
              )}
            />
          </div>

          {/* Actions menu */}
          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={handleMenuClick}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 w-8 p-0 opacity-0 transition-opacity',
                    'hover:bg-accent group-hover:opacity-100'
                  )}
                >
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={handleEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-dynamic-red focus:text-dynamic-red"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Subtle shimmer effect on hover */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
          'bg-linear-to-r from-transparent via-white/5 to-transparent',
          isHovered && 'opacity-100'
        )}
      />
    </Card>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  FileText,
  Lock,
  MoreVertical,
  Pencil,
  Tag,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ConfidentialAmount } from '@tuturuuu/ui/finance/transactions/confidential-field';
import { WalletIconDisplay } from '@tuturuuu/ui/finance/wallets/wallet-icon-display';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import moment from 'moment';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface TransactionCardProps {
  transaction: Transaction & {
    creator?: {
      full_name: string;
      email: string;
      avatar_url: string | null;
    } | null;
  };
  wsId: string;
  currency?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  /** Hide the transaction creator (useful for personal workspaces where all transactions belong to the same user) */
  showCreator?: boolean;
  isDaily?: boolean;
}

export function TransactionCard({
  transaction,
  currency = 'USD',
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  showCreator = true,
  wsId,
  isDaily = false,
}: TransactionCardProps) {
  const t = useTranslations('workspace-finance-transactions');
  const [isHovered, setIsHovered] = useState(false);
  const isExpense = (transaction.amount || 0) < 0;

  // Check if transaction is confidential
  const isConfidential =
    transaction.is_amount_confidential ||
    transaction.is_description_confidential ||
    transaction.is_category_confidential;

  // Get custom icon if available
  const CategoryIcon = useMemo(() => {
    if (transaction.category_icon) {
      return getIconComponentByKey(
        transaction.category_icon as PlatformIconKey
      );
    }
    return null;
  }, [transaction.category_icon]);

  // Get custom color styles if available
  const customColorStyles = useMemo(() => {
    if (transaction.category_color) {
      return computeAccessibleLabelStyles(transaction.category_color);
    }
    return null;
  }, [transaction.category_color]);

  // Fetch wallets to get icon/image
  // This shares the cache with WalletsPage
  const { data: wallets } = useQuery({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_wallets')
        .select('*')
        .eq('ws_id', wsId);

      if (error) throw error;
      return data as Wallet[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const wallet = useMemo(() => {
    if (!transaction.wallet_id || !wallets) return null;
    return wallets.find((w) => w.id === transaction.wallet_id);
  }, [transaction.wallet_id, wallets]);

  // Determine if we should use custom styling
  const hasCustomStyling = Boolean(customColorStyles);

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

  // Determine card border and background colors
  const getCardStyles = () => {
    if (isConfidential) {
      return 'border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/5 to-transparent';
    }
    if (hasCustomStyling && customColorStyles) {
      return ''; // Will use inline styles
    }
    return isExpense
      ? 'border-dynamic-red/20 bg-linear-to-br from-dynamic-red/5 to-transparent hover:border-dynamic-red/40'
      : 'border-dynamic-green/20 bg-linear-to-br from-dynamic-green/5 to-transparent hover:border-dynamic-green/40';
  };

  // Determine accent bar color
  const getAccentBarColor = () => {
    if (isConfidential) return 'bg-dynamic-orange';
    if (hasCustomStyling && customColorStyles) return ''; // Will use inline styles
    return isExpense ? 'bg-dynamic-red' : 'bg-dynamic-green';
  };

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg',
        getCardStyles()
      )}
      style={
        hasCustomStyling && !isConfidential && customColorStyles
          ? {
              borderColor: customColorStyles.border,
              background: `linear-gradient(to bottom right, ${customColorStyles.bg}, transparent)`,
            }
          : undefined
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Accent bar on left */}
      <div
        className={cn(
          'absolute top-0 bottom-0 left-0 w-1 transition-all duration-200',
          getAccentBarColor(),
          isHovered ? 'w-1.5' : 'w-1'
        )}
        style={
          hasCustomStyling && !isConfidential && customColorStyles
            ? { backgroundColor: customColorStyles.text }
            : undefined
        }
      />

      <div className="flex flex-col gap-1.5 p-3 pl-4 sm:gap-0">
        {/* Mobile: Stacked layout | Desktop: Side-by-side layout */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Icon */}
          <div className="shrink-0">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 sm:rounded-2xl',
                'shadow-sm ring-1 ring-black/5',
                isConfidential
                  ? 'bg-linear-to-br from-dynamic-orange/20 to-dynamic-orange/10'
                  : !hasCustomStyling &&
                      (isExpense
                        ? 'bg-linear-to-br from-dynamic-red/20 to-dynamic-red/10'
                        : 'bg-linear-to-br from-dynamic-green/20 to-dynamic-green/10'),
                isHovered && 'scale-105 shadow-md'
              )}
              style={
                hasCustomStyling && !isConfidential && customColorStyles
                  ? {
                      background: `linear-gradient(to bottom right, ${customColorStyles.bg}, ${customColorStyles.bg}80)`,
                    }
                  : undefined
              }
            >
              {isConfidential ? (
                <Lock className="h-4 w-4 text-dynamic-orange sm:h-6 sm:w-6" />
              ) : CategoryIcon ? (
                <CategoryIcon
                  className="h-4 w-4 sm:h-6 sm:w-6"
                  style={
                    customColorStyles
                      ? { color: customColorStyles.text }
                      : undefined
                  }
                />
              ) : isExpense ? (
                <ArrowDownCircle
                  className={cn(
                    'h-4 w-4 sm:h-6 sm:w-6',
                    !hasCustomStyling && 'text-dynamic-red'
                  )}
                  style={
                    customColorStyles
                      ? { color: customColorStyles.text }
                      : undefined
                  }
                />
              ) : (
                <ArrowUpCircle
                  className={cn(
                    'h-4 w-4 sm:h-6 sm:w-6',
                    !hasCustomStyling && 'text-dynamic-green'
                  )}
                  style={
                    customColorStyles
                      ? { color: customColorStyles.text }
                      : undefined
                  }
                />
              )}
            </div>
          </div>

          {/* Header row: Badges + Amount */}
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            {/* Badges */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
              {transaction.category && (
                <Badge
                  variant="outline"
                  className={cn(
                    'font-semibold text-[11px] transition-colors sm:text-xs',
                    isConfidential
                      ? 'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange'
                      : !hasCustomStyling &&
                          (isExpense
                            ? 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red'
                            : 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green')
                  )}
                  style={
                    hasCustomStyling && !isConfidential && customColorStyles
                      ? {
                          backgroundColor: customColorStyles.bg,
                          borderColor: customColorStyles.border,
                          color: customColorStyles.text,
                        }
                      : undefined
                  }
                >
                  {transaction.category}
                </Badge>
              )}
              {transaction.wallet && (
                <Link
                  href={`/${wsId}/finance/wallets/${transaction.wallet_id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Badge
                    variant="outline"
                    className="gap-1 border-muted-foreground/30 bg-muted/50 px-1.5 py-0.5 font-medium text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary sm:px-2 sm:text-xs"
                  >
                    <WalletIconDisplay
                      icon={wallet?.icon}
                      imageSrc={wallet?.image_src}
                      size="sm"
                      className="h-3 w-3"
                    />
                    {transaction.wallet}
                  </Badge>
                </Link>
              )}
              {isConfidential && (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 border-dynamic-orange/40 bg-dynamic-orange/5 text-[11px] text-dynamic-orange sm:text-xs"
                >
                  <Lock className="h-2.5 w-2.5" />
                  {t('confidential')}
                </Badge>
              )}
            </div>

            {/* Amount + Actions */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <ConfidentialAmount
                amount={transaction.amount ?? null}
                isConfidential={transaction.is_amount_confidential || false}
                currency={currency}
                className={cn(
                  'font-bold text-sm tabular-nums transition-all duration-200 sm:text-xl',
                  isConfidential
                    ? 'text-dynamic-orange'
                    : !hasCustomStyling &&
                        (isExpense ? 'text-dynamic-red' : 'text-dynamic-green'),
                  isHovered && 'scale-105'
                )}
                style={
                  hasCustomStyling && !isConfidential && customColorStyles
                    ? { color: customColorStyles.text }
                    : undefined
                }
              />
              {(canEdit || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={handleMenuClick}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-7 w-7 p-0 transition-opacity sm:h-8 sm:w-8',
                        'opacity-100 hover:bg-accent sm:opacity-0 sm:group-hover:opacity-100'
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
        </div>

        {/* Content section - Full width on mobile */}
        <div className="flex flex-col gap-1.5 sm:ml-13 sm:gap-2">
          {/* Description - Full width, its own row */}
          {transaction.description && (
            <div className="flex items-start gap-1.5 text-foreground/80 sm:gap-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
              <p className="text-[13px] leading-relaxed sm:line-clamp-2 sm:text-sm">
                {transaction.description}
              </p>
            </div>
          )}

          {/* Tags row */}
          {transaction.tags && transaction.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Tag className="h-3 w-3 text-muted-foreground" />
              {transaction.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="px-1.5 py-0 font-normal text-[10px]"
                  style={{
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                    borderColor: `${tag.color}40`,
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}

          {/* Metadata row */}
          {((!isDaily && transaction.taken_at) ||
            (showCreator && transaction.user)) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:gap-x-4 sm:text-xs">
              {!isDaily && transaction.taken_at && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {moment(transaction.taken_at).format('DD/MM/YYYY')}
                  </span>
                </div>
              )}
              {showCreator && transaction.user && (
                <div className="flex items-center gap-1">
                  <Avatar className="h-3.5 w-3.5 ring-1 ring-border sm:h-4 sm:w-4">
                    <AvatarImage
                      src={transaction.user.avatar_url || undefined}
                    />
                    <AvatarFallback className="text-[7px] sm:text-[8px]">
                      {transaction.user.full_name?.[0] ||
                        transaction.user.email?.[0] ||
                        '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-30 truncate sm:max-w-none">
                    {transaction.user.full_name || transaction.user.email}
                  </span>
                </div>
              )}
            </div>
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

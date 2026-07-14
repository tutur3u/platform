'use client';

import { MoreHorizontal, Tag, TicketCheck, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';

export interface LinkedPromotionItem {
  code: string | null;
  description: string | null;
  id: string;
  name: string | null;
  use_ratio: boolean | null;
  value: number | null;
}

interface LinkedPromotionCardProps {
  canUpdateUsers: boolean;
  onUnlink: (promotion: LinkedPromotionItem) => void;
  promotion: LinkedPromotionItem;
  referralDiscount?: number;
}

export function LinkedPromotionCard({
  canUpdateUsers,
  onUnlink,
  promotion,
  referralDiscount,
}: LinkedPromotionCardProps) {
  const t = useTranslations();
  const isReferral = referralDiscount !== undefined;

  return (
    <div className="group flex justify-between rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-black/5 hover:shadow-lg md:p-6">
      <div className="flex min-w-0 items-center space-x-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 font-semibold text-foreground text-lg">
            <TicketCheck className="h-5 w-5 shrink-0" />
            <span className="sr-only">
              {t('ws-user-linked-coupons.coupon_label')}
            </span>
            <span className="truncate">
              {promotion.name || t('ws-user-linked-coupons.coupon_label')}
            </span>
          </div>
          {promotion.description && (
            <div className="mb-2 line-clamp-2 text-muted-foreground text-sm">
              {promotion.description}
            </div>
          )}
          {(isReferral || promotion.value !== null) && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-foreground/10 px-2 py-1 font-medium text-foreground text-xs">
              <Tag className="h-3.5 w-3.5" />
              <span className="sr-only">
                {t('ws-user-linked-coupons.discount_value_label')}
              </span>
              <span>
                {isReferral
                  ? `${referralDiscount}%`
                  : promotion.use_ratio
                    ? `${promotion.value ?? 0}%`
                    : (promotion.value ?? 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isReferral && canUpdateUsers && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-60 transition-opacity hover:bg-muted/80 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => onUnlink(promotion)}
              className="cursor-pointer text-dynamic-red"
            >
              <Trash2 className="mr-2 h-4 w-4 text-dynamic-red" />
              {t('ws-user-linked-coupons.unlink')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, TicketCheck } from '@tuturuuu/icons';
import {
  listWorkspacePromotions,
  listWorkspaceUserLinkedPromotions,
  listWorkspaceUserReferralDiscounts,
} from '@tuturuuu/internal-api/promotions';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { INVENTORY_APP_URL } from '@/constants/common';
import { LinkPromotionDialog } from './link-promotion-dialog';
import {
  LinkedPromotionCard,
  type LinkedPromotionItem,
} from './linked-promotion-card';
import {
  linkWorkspaceUserPromotion,
  unlinkWorkspaceUserPromotion,
} from './promotion-api-client';

interface WorkspacePromotion {
  id: string;
  name: string | null;
  description: string | null;
  code: string | null;
  value: number | null;
  use_ratio: boolean | null;
}

interface LinkedPromotionsClientProps {
  wsId: string;
  userId: string;
  canUpdateUsers: boolean;
  initialPromotions: LinkedPromotionItem[];
  initialCount: number;
}

const useWorkspacePromotions = (wsId: string, enabled: boolean) => {
  return useQuery({
    queryKey: ['workspace-promotions', wsId],
    queryFn: async () => {
      const data = await listWorkspacePromotions(wsId);
      return (Array.isArray(data) ? data : [])
        .filter((promotion) => promotion.promo_type !== 'REFERRAL')
        .map((promotion) => ({
          id: promotion.id,
          name: promotion.name,
          description: promotion.description ?? null,
          code: promotion.code,
          value: promotion.value,
          use_ratio: promotion.use_ratio,
        })) as WorkspacePromotion[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

type ReferralDiscountRow = {
  promo_id: string | null;
  calculated_discount_value: number | null;
};

export default function LinkedPromotionsClient({
  wsId,
  userId,
  canUpdateUsers,
  initialPromotions,
  initialCount: _initialCount,
}: LinkedPromotionsClientProps) {
  const t = useTranslations();

  // Source of truth via React Query; hydrate with SSR data
  const userLinkedPromotionsQuery = useQuery({
    queryKey: ['user-linked-promotions', wsId, userId],
    queryFn: async (): Promise<LinkedPromotionItem[]> => {
      const data = await listWorkspaceUserLinkedPromotions(wsId, userId);
      const items = (Array.isArray(data) ? data : []).flatMap(
        ({ workspace_promotions: promotion }) =>
          promotion
            ? [
                {
                  id: promotion.id,
                  name: promotion.name,
                  description: promotion.description ?? null,
                  code: promotion.code,
                  value: promotion.value,
                  use_ratio: promotion.use_ratio,
                },
              ]
            : []
      ) as LinkedPromotionItem[];
      return items;
    },
    initialData: initialPromotions,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const count = (userLinkedPromotionsQuery.data || []).length;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState<string>('');
  const [deletingPromotion, setDeletingPromotion] =
    useState<LinkedPromotionItem | null>(null);
  const queryClient = useQueryClient();

  const workspacePromotionsQuery = useWorkspacePromotions(
    wsId,
    canUpdateUsers && isAddDialogOpen
  );
  const allPromotions = workspacePromotionsQuery.data;

  // Fetch dynamic referral discount values per user/promo (percent)
  const referralDiscountsQuery = useQuery({
    queryKey: ['user-referral-discounts', wsId, userId],
    queryFn: async (): Promise<ReferralDiscountRow[]> =>
      listWorkspaceUserReferralDiscounts(wsId, userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const referralDiscountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of referralDiscountsQuery.data || []) {
      if (row.promo_id) {
        map.set(row.promo_id, row.calculated_discount_value ?? 0);
      }
    }
    return map;
  }, [referralDiscountsQuery.data]);

  const availablePromotions = useMemo(() => {
    const linkedIds = new Set(
      (userLinkedPromotionsQuery.data || []).map((p) => p.id)
    );
    return (allPromotions || []).filter((p) => !linkedIds.has(p.id));
  }, [allPromotions, userLinkedPromotionsQuery.data]);

  const addPromotionMutation = useMutation({
    mutationFn: ({ promoId }: { promoId: string }) =>
      linkWorkspaceUserPromotion(wsId, userId, promoId),
    onSuccess: () => {
      setIsAddDialogOpen(false);
      setSelectedPromoId('');
      toast(t('ws-user-linked-coupons.link_success'));
      queryClient.invalidateQueries({
        queryKey: ['user-linked-promotions', wsId, userId],
      });
      // Ensure other consumers with different query keys also refresh
      queryClient.invalidateQueries({
        queryKey: ['user-linked-promotions', userId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-promotions', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['user-referral-discounts', wsId, userId],
      });
      queryClient.invalidateQueries({
        queryKey: ['available-promotions', wsId, userId],
      });
    },
    onError: (error: unknown) => {
      toast(
        error instanceof Error
          ? error.message
          : t('ws-user-linked-coupons.link_failed')
      ); // reuse label if missing specific error key
    },
  });

  const deletePromotionMutation = useMutation({
    mutationFn: async ({ promoId }: { promoId: string }) => {
      await unlinkWorkspaceUserPromotion(wsId, userId, promoId);
      return { promoId };
    },
    onSuccess: () => {
      setIsDeleteDialogOpen(false);
      setDeletingPromotion(null);
      toast(t('ws-user-linked-coupons.unlink_success'));
      queryClient.invalidateQueries({
        queryKey: ['user-linked-promotions', wsId, userId],
      });
      // Ensure other consumers with different query keys also refresh
      queryClient.invalidateQueries({
        queryKey: ['user-linked-promotions', userId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-promotions', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['user-referral-discounts', wsId, userId],
      });
      queryClient.invalidateQueries({
        queryKey: ['available-promotions', wsId, userId],
      });
    },
    onError: (error: unknown) => {
      toast(
        error instanceof Error
          ? error.message
          : t('ws-user-linked-coupons.unlink_failed')
      );
    },
  });

  const promotionOptions = useMemo(
    () =>
      availablePromotions.map((promotion) => ({
        value: promotion.id,
        label: `${promotion.name || t('ws-user-linked-coupons.coupon_label')} ${promotion.code ? ` (${promotion.code})` : ''}${promotion.value ? ` (${promotion.value}${promotion.use_ratio ? '%' : ''})` : ''}`,
      })),
    [availablePromotions, t]
  );
  const managePromotionsUrl = `${INVENTORY_APP_URL}/${wsId}/promotions`;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-semibold text-xl">
          {t('ws-user-linked-coupons.title')}
          {!!count && ` (${count})`}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href={managePromotionsUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('ws-user-linked-coupons.manage_action')}
            </a>
          </Button>
          {canUpdateUsers && (
            <LinkPromotionDialog
              isLinking={addPromotionMutation.isPending}
              isLoading={workspacePromotionsQuery.isLoading}
              isLoadError={workspacePromotionsQuery.isError}
              manageUrl={managePromotionsUrl}
              onLink={() => {
                if (selectedPromoId) {
                  addPromotionMutation.mutate({ promoId: selectedPromoId });
                }
              }}
              onOpenChange={(open) => {
                setIsAddDialogOpen(open);
                if (!open) setSelectedPromoId('');
              }}
              onRetry={() => workspacePromotionsQuery.refetch()}
              onSelect={setSelectedPromoId}
              open={isAddDialogOpen}
              options={promotionOptions}
              selectedPromoId={selectedPromoId}
            />
          )}
        </div>
      </div>

      {userLinkedPromotionsQuery.isError && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
          <span>{t('ws-user-linked-coupons.linked_load_warning')}</span>
        </div>
      )}

      {count > 0 ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {(userLinkedPromotionsQuery.data || []).map((promo) => (
            <LinkedPromotionCard
              key={promo.id}
              canUpdateUsers={canUpdateUsers}
              onUnlink={(promotion) => {
                setDeletingPromotion(promotion);
                setIsDeleteDialogOpen(true);
              }}
              promotion={promo}
              referralDiscount={referralDiscountMap.get(promo.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <TicketCheck className="mb-4 h-12 w-12 text-muted-foreground" />
          <div className="font-medium text-muted-foreground">
            {t('ws-user-linked-coupons.empty_title')}
          </div>
          <div className="text-muted-foreground text-sm">
            {t('ws-user-linked-coupons.empty_description')}
          </div>
          {canUpdateUsers && (
            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              onClick={() => setIsAddDialogOpen(true)}
            >
              {t('ws-user-linked-coupons.link_action')}
            </Button>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('ws-user-linked-coupons.unlink_title')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-user-linked-coupons.unlink_confirm', {
                name: deletingPromotion?.name || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deletePromotionMutation.isPending}
            >
              {t('ws-settings.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingPromotion) {
                  deletePromotionMutation.mutate({
                    promoId: deletingPromotion.id,
                  });
                }
              }}
              disabled={deletePromotionMutation.isPending}
            >
              {deletePromotionMutation.isPending
                ? t('ws-user-linked-coupons.unlinking')
                : t('ws-user-linked-coupons.unlink')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

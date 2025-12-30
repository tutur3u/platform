'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  MoreHorizontal,
  Tag,
  TicketCheck,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface WorkspacePromotion {
  id: string;
  name: string | null;
  description: string | null;
  code: string | null;
  value: number | null;
  use_ratio: boolean | null;
}

interface LinkedPromotionItem {
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

const useWorkspacePromotions = (wsId: string) => {
  const t = useTranslations();
  return useQuery({
    queryKey: ['workspace-promotions', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_promotions')
        .select('id, name, description, code, value, use_ratio')
        .eq('ws_id', wsId)
        .neq('promo_type', 'REFERRAL')
        .order('created_at', { ascending: false });
      if (error) {
        toast(
          error instanceof Error
            ? error.message
            : t('ws-user-linked-coupons.load_failed')
        );
        return [] as WorkspacePromotion[];
      }
      return (data || []) as WorkspacePromotion[];
    },
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
      console.log('Fetching linked promotions for user:', userId);
      const supabase = createClient();
      // Single joined query: get linked promotions with joined workspace promotion data
      const { data, error } = await supabase
        .from('user_linked_promotions')
        .select(
          'workspace_promotions!inner(id, name, description, code, value, use_ratio)'
        )
        .eq('user_id', userId)
        .eq('workspace_promotions.ws_id', wsId);
      if (error) throw error;
      const items = (data || [])
        .map((row: any) => row.workspace_promotions)
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id as string,
          name: (p.name ?? null) as string | null,
          description: (p.description ?? null) as string | null,
          code: (p.code ?? null) as string | null,
          value: (p.value ?? null) as number | null,
          use_ratio: (p.use_ratio ?? null) as boolean | null,
        })) as LinkedPromotionItem[];
      return items;
    },
    initialData: initialPromotions,
    staleTime: 5 * 60 * 1000,
  });
  const count = (userLinkedPromotionsQuery.data || []).length;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState<string>('');
  const [deletingPromotion, setDeletingPromotion] =
    useState<LinkedPromotionItem | null>(null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: allPromotions } = useWorkspacePromotions(wsId);

  // Fetch dynamic referral discount values per user/promo (percent)
  const referralDiscountsQuery = useQuery({
    queryKey: ['user-referral-discounts', wsId, userId],
    queryFn: async (): Promise<ReferralDiscountRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('v_user_referral_discounts')
        .select('promo_id, calculated_discount_value')
        .eq('ws_id', wsId)
        .eq('user_id', userId);
      if (error) throw error;
      return (data || []) as ReferralDiscountRow[];
    },
    staleTime: 5 * 60 * 1000,
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
    mutationFn: async ({ promoId }: { promoId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('user_linked_promotions')
        .insert({ user_id: userId, promo_id: promoId });
      if (error) throw error;
      return { promoId };
    },
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
      const supabase = createClient();
      const { error } = await supabase
        .from('user_linked_promotions')
        .delete()
        .eq('user_id', userId)
        .eq('promo_id', promoId);
      if (error) throw error;
      return { promoId };
    },
    onSuccess: ({ promoId: _promoId }) => {
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

  const handleAdd = async () => {
    if (!selectedPromoId) {
      return;
    }
    setLoading(true);
    try {
      await addPromotionMutation.mutateAsync({ promoId: selectedPromoId });
    } catch (_) {
      // handled in onError
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPromotion) return;
    setLoading(true);
    try {
      await deletePromotionMutation.mutateAsync({
        promoId: deletingPromotion.id,
      });
    } catch (_) {
      // handled in onError
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold text-xl">
          {t('ws-user-linked-coupons.title')}
          {!!count && ` (${count})`}
        </div>
        {canUpdateUsers && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Link className="mr-2 h-4 w-4" />
                {t('ws-user-linked-coupons.link_action')}
              </Button>
            </DialogTrigger>
            <DialogContent onWheel={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>
                  {t('ws-user-linked-coupons.link_action')}
                </DialogTitle>
                <DialogDescription>
                  {t('ws-user-linked-coupons.link_description')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="promo-select">
                    {t('ws-user-linked-coupons.coupon_label')}
                  </Label>
                  <Combobox
                    t={t}
                    options={availablePromotions.map(
                      (p): ComboboxOptions => ({
                        value: p.id,
                        label: `${p.name || t('ws-user-linked-coupons.coupon_label')} ${p.code ? ` (${p.code})` : ''}${p.value ? ` (${p.value}${p.use_ratio ? '%' : ''})` : ''}`,
                      })
                    )}
                    selected={selectedPromoId}
                    onChange={(value) => setSelectedPromoId(value as string)}
                    placeholder={t('ws-user-linked-coupons.search_placeholder')}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  disabled={loading}
                >
                  {t('ws-settings.cancel')}
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={loading || !selectedPromoId}
                >
                  {loading
                    ? t('ws-groups.linking')
                    : t('ws-user-linked-coupons.link_action')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {count > 0 ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {(userLinkedPromotionsQuery.data || []).map((promo) => (
            <div
              key={promo.id}
              className="group flex justify-between rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-black/5 hover:shadow-lg md:p-6"
            >
              <div className="flex items-center space-x-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 font-semibold text-foreground text-lg">
                    <TicketCheck className="h-5 w-5" />
                    <span className="sr-only">
                      {t('ws-user-linked-coupons.coupon_label')}
                    </span>
                    {promo.name || t('ws-user-linked-coupons.coupon_label')}
                  </div>
                  <div>
                    {promo.description && (
                      <div className="mb-2 line-clamp-2 text-muted-foreground text-sm">
                        {promo.description}
                      </div>
                    )}
                    {(referralDiscountMap.has(promo.id) ||
                      (promo.value ?? null) !== null) && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-foreground/10 px-2 py-1 font-medium text-foreground text-xs">
                        <Tag className="h-3.5 w-3.5" />
                        <span className="sr-only">
                          {t('ws-user-linked-coupons.discount_value_label')}
                        </span>
                        <span>
                          {referralDiscountMap.has(promo.id)
                            ? `${referralDiscountMap.get(promo.id) ?? 0}%`
                            : promo.use_ratio
                              ? `${promo.value ?? 0}%`
                              : `${(promo.value ?? 0).toLocaleString()}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {!referralDiscountMap.has(promo.id) && canUpdateUsers && (
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
                      onClick={() => {
                        setDeletingPromotion(promo);
                        setIsDeleteDialogOpen(true);
                      }}
                      className="cursor-pointer text-dynamic-red"
                    >
                      <Trash2 className="mr-2 h-4 w-4 text-dynamic-red" />
                      {t('ws-user-linked-coupons.unlink')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
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
              disabled={loading}
            >
              {t('ws-settings.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading
                ? t('ws-user-linked-coupons.unlinking')
                : t('ws-user-linked-coupons.unlink')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

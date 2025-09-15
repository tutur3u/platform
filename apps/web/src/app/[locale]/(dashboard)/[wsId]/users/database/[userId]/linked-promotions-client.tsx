'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '@tuturuuu/ui/button';
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
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Link,
  MoreHorizontal,
  Trash2,
  TicketCheck,
  Tag,
} from '@tuturuuu/ui/icons';

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

export default function LinkedPromotionsClient({
  wsId,
  userId,
  initialPromotions,
  initialCount,
}: LinkedPromotionsClientProps) {
  const t = useTranslations();
  const [promotions, setPromotions] =
    useState<LinkedPromotionItem[]>(initialPromotions);
  const [count, setCount] = useState<number>(initialCount);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState<string>('');
  const [deletingPromotion, setDeletingPromotion] =
    useState<LinkedPromotionItem | null>(null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: allPromotions } = useWorkspacePromotions(wsId);

  const availablePromotions = useMemo(() => {
    const linkedIds = new Set(promotions.map((p) => p.id));
    return (allPromotions || []).filter((p) => !linkedIds.has(p.id));
  }, [allPromotions, promotions]);

  const addPromotionMutation = useMutation({
    mutationFn: async ({ promoId }: { promoId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('user_linked_promotions')
        .insert({ user_id: userId, promo_id: promoId });
      if (error) throw error;
      const matched = (allPromotions || []).find((p) => p.id === promoId);
      const newLinked: LinkedPromotionItem = {
        id: promoId,
        name: matched?.name ?? null,
        description: matched?.description ?? null,
        code: matched?.code ?? null,
        value: matched?.value ?? null,
        use_ratio: matched?.use_ratio ?? null,
      };
      return newLinked;
    },
    onSuccess: (newLinked) => {
      setPromotions((prev) => [...prev, newLinked]);
      setCount((c) => c + 1);
      setIsAddDialogOpen(false);
      setSelectedPromoId('');
      toast(t('ws-user-linked-coupons.link_success'));
      queryClient.invalidateQueries({
        queryKey: ['workspace-promotions', wsId],
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
    onSuccess: ({ promoId }) => {
      setPromotions((prev) => prev.filter((p) => p.id !== promoId));
      setCount((c) => Math.max(0, c - 1));
      setIsDeleteDialogOpen(false);
      setDeletingPromotion(null);
      toast(t('ws-user-linked-coupons.unlink_success'));
      queryClient.invalidateQueries({
        queryKey: ['workspace-promotions', wsId],
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
      </div>

      {count > 0 ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {promotions.map((promo) => (
            <div
              key={promo.id}
              className="group flex justify-between rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 md:p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:border-border hover:bg-card/80"
            >
              <div className="flex items-center space-x-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-lg text-foreground mb-1 flex items-center gap-2">
                    <TicketCheck className="h-5 w-5" />
                    <span className="sr-only">
                      {t('ws-user-linked-coupons.coupon_label')}
                    </span>
                    {promo.name || t('ws-user-linked-coupons.coupon_label')}
                  </div>
                  <div>
                    {promo.description && (
                      <div className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {promo.description}
                      </div>
                    )}
                    {(promo.value ?? null) !== null && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-foreground/10 px-2 py-1 text-xs font-medium text-foreground">
                        <Tag className="h-3.5 w-3.5" />
                        <span className="sr-only">
                          {t('ws-user-linked-coupons.discount_value_label')}
                        </span>
                        <span>
                          {promo.use_ratio
                            ? `${promo.value ?? 0}%`
                            : `${(promo.value ?? 0).toLocaleString()}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-60 group-hover:opacity-100 transition-opacity hover:bg-muted/80"
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
                    className="text-dynamic-red cursor-pointer"
                  >
                    <Trash2 className="mr-2 h-4 w-4 text-dynamic-red" />
                    {t('ws-user-linked-coupons.unlink')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <TicketCheck className="mb-4 h-12 w-12 text-muted-foreground" />
          <div className="font-medium text-muted-foreground">
            {t('ws-user-linked-coupons.empty_title')}
          </div>
          <div className="text-sm text-muted-foreground">
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

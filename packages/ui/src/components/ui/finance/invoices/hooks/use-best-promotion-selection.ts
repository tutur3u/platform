'use client';

import { useEffect, useRef } from 'react';

interface LinkedPromotionRow {
  promo_id?: string | null;
  workspace_promotions?: {
    value?: number | null;
    use_ratio?: boolean | null;
  } | null;
}

interface UseBestPromotionSelectionProps {
  enabled: boolean;
  selectedUserId: string;
  linkedPromotions: LinkedPromotionRow[];
  selectedPromotionId: string;
  subtotal: number;
  referralDiscountMap: Map<string, number>;
  onSelectPromotion: (id: string) => void;
}

export function useBestPromotionSelection({
  enabled,
  selectedUserId,
  linkedPromotions,
  selectedPromotionId,
  subtotal,
  referralDiscountMap,
  onSelectPromotion,
}: UseBestPromotionSelectionProps) {
  const hasAppliedBestPromotion = useRef(false);

  const lastResetKeyRef = useRef('');

  useEffect(() => {
    const promotionKey = Array.isArray(linkedPromotions)
      ? linkedPromotions
          .map((promotion) => {
            const id = promotion?.promo_id ?? '';
            const promo = promotion?.workspace_promotions;
            const value = promo?.value ?? 0;
            const useRatio = promo?.use_ratio ? '1' : '0';
            return `${id}:${useRatio}:${value}`;
          })
          .join('|')
      : '';
    const resetKey = `${enabled ? '1' : '0'}|${selectedUserId}|${subtotal}|${promotionKey}`;
    if (resetKey !== lastResetKeyRef.current) {
      lastResetKeyRef.current = resetKey;
      hasAppliedBestPromotion.current = false;
    }

    if (
      !enabled ||
      !selectedUserId ||
      !Array.isArray(linkedPromotions) ||
      linkedPromotions.length === 0 ||
      selectedPromotionId !== 'none' ||
      subtotal <= 0
    ) {
      return;
    }

    const candidates = linkedPromotions
      .map((lp) => {
        const id = lp?.promo_id as string | undefined;
        const promoObj = lp?.workspace_promotions as
          | { value?: number | null; use_ratio?: boolean | null }
          | undefined;
        return id
          ? {
              id,
              use_ratio: !!promoObj?.use_ratio,
              value: Number(promoObj?.value ?? 0),
            }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      use_ratio: boolean;
      value: number;
    }>;

    if (candidates.length === 0) return;

    const computeDiscount = (id: string, use_ratio: boolean, value: number) => {
      const referralPercent = referralDiscountMap.get(id);
      if (referralPercent !== undefined) {
        return subtotal * ((referralPercent || 0) / 100);
      }
      return use_ratio ? subtotal * (value / 100) : Math.min(value, subtotal);
    };

    let best: { id: string } | null = null;
    let bestAmount = -1;
    for (const c of candidates) {
      const amount = computeDiscount(c.id, c.use_ratio, c.value);
      if (amount > bestAmount) {
        best = { id: c.id };
        bestAmount = amount;
      }
    }

    if (best?.id) {
      if (hasAppliedBestPromotion.current) return;
      hasAppliedBestPromotion.current = true;
      onSelectPromotion(best.id);
    }
  }, [
    enabled,
    selectedUserId,
    linkedPromotions,
    selectedPromotionId,
    subtotal,
    referralDiscountMap,
    onSelectPromotion,
  ]);
}

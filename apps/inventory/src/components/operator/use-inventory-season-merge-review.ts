'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  applyInventorySeasonMerge,
  previewInventorySeasonMerge,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
export type Choice = '' | 'source' | 'target';
export function useInventorySeasonMergeReview({
  wsId,
  onComplete,
  onPending,
}: {
  wsId: string;
  onComplete: () => Promise<void>;
  onPending: (value: boolean) => void;
}) {
  const t = useTranslations('inventory.operator.seasonMerge');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [descriptionPolicy, setDescription] = useState<Choice>('');
  const [rulePolicy, setRules] = useState<Choice>('');
  const [pricePolicy, setPrices] = useState<'' | 'block' | 'target'>('');
  const [page, setPage] = useState(1);
  const [reviewedPage, setReviewedPage] = useState(0);
  const [reviewedVersion, setReviewedVersion] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const selectionId = useId();
  const checkboxId = useId();
  const valid = Boolean(sourceId && targetId && sourceId !== targetId);
  const preview = useQuery({
    queryKey: ['inventory', wsId, 'season-merge', sourceId, targetId],
    queryFn: () => previewInventorySeasonMerge(wsId, { sourceId, targetId }),
    enabled: valid,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const token = preview.data?.version;
  const paged = useQuery({
    queryKey: ['inventory', wsId, 'season-merge-page', token, page],
    queryFn: () =>
      previewInventorySeasonMerge(wsId, {
        sourceId,
        targetId,
        version: token,
        page,
      }),
    enabled: valid && !!token && page > 1,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const query = page === 1 ? preview : paged;
  const data = valid ? query.data : undefined;
  // A timer only; data fetching stays in React Query. The server is authoritative.
  useEffect(() => {
    setExpired(false);
    setConfirmed(null);
    setReviewedPage(0);
    if (!preview.data) return;
    const remaining = Date.parse(preview.data.expiresAt) - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = setTimeout(() => {
      setExpired(true);
      setConfirmed(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [preview.data]);
  const ruleConflicts = !data
    ? 0
    : rulePolicy === 'source'
      ? data.sourceRuleConflictCount
      : data.targetRuleConflictCount;
  const labelsReady =
    !!data?.source.name &&
    !!data.target.name &&
    [...data.futurePrices, ...data.conflicts].every(
      (row) => row.productName && row.unitName && row.warehouseName
    ) &&
    [...data.sourceRules, ...data.targetRules].every((row) => row.name);
  const blocked =
    !data ||
    !!data.blockers.length ||
    !!ruleConflicts ||
    (pricePolicy === 'block' && data.conflictCount > 0);
  const policiesReady = !!descriptionPolicy && !!rulePolicy && !!pricePolicy;
  const reviewReady =
    !!data &&
    !blocked &&
    policiesReady &&
    labelsReady &&
    !expired &&
    !query.isError &&
    !query.isFetching &&
    data.version === token &&
    !data.hasMore &&
    (page === 1 || (reviewedVersion === token && reviewedPage >= page - 1));
  const mutation = useMutation({
    mutationFn: () => {
      if (
        !ready ||
        confirmed !== token ||
        !token ||
        !descriptionPolicy ||
        !rulePolicy ||
        !pricePolicy
      )
        throw new Error('Preview required');
      return applyInventorySeasonMerge(wsId, {
        sourceId,
        targetId,
        version: token,
        descriptionPolicy,
        rulePolicy,
        pricePolicy,
      });
    },
    onSuccess: async () => {
      toast.success(t('success'));
      await onComplete();
    },
    onError: () => {
      setConfirmed(null);
    },
  });
  const refresh = () => {
    setConfirmed(null);
    setPage(1);
    setReviewedPage(0);
    mutation.reset();
    void preview.refetch();
  };
  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
    setReviewedPage(0);
    setConfirmed(null);
    mutation.reset();
  };
  const pending = mutation.isPending;
  const ready = reviewReady && !mutation.isError;
  useEffect(() => {
    onPending(pending);
    return () => onPending(false);
  }, [pending, onPending]);
  return {
    t,
    sourceId,
    targetId,
    setSourceId,
    setTargetId,
    descriptionPolicy,
    setDescription,
    rulePolicy,
    setRules,
    pricePolicy,
    setPrices,
    page,
    setPage,
    reviewedPage,
    setReviewedPage,
    setReviewedVersion,
    confirmed,
    setConfirmed,
    expired,
    selectionId,
    checkboxId,
    token,
    data,
    query,
    preview,
    labelsReady,
    valid,
    ruleConflicts,
    ready,
    pending,
    mutation,
    refresh,
    change,
  };
}

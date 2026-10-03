'use client';
import { useQuery } from '@tanstack/react-query';
import { previewInventorySeasonMerge } from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { useInventoryActor } from './inventory-session-scope';
import { useSeasonMergeRecovery } from './use-season-merge-recovery';
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
  const actorId = useInventoryActor();
  const recovery = useSeasonMergeRecovery({
    actorId,
    wsId,
    onComplete: () => {
      toast.success(t('success'));
      void onComplete().catch(() => undefined);
    },
  });
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
  const valid = Boolean(
    actorId && sourceId && targetId && sourceId !== targetId
  );
  const reviewLocked =
    recovery.pending ||
    !!recovery.request ||
    recovery.loading ||
    recovery.storageError;
  const preview = useQuery({
    queryKey: ['inventory', wsId, 'season-merge', actorId, sourceId, targetId],
    queryFn: () => previewInventorySeasonMerge(wsId, { sourceId, targetId }),
    enabled: valid && !reviewLocked,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const token = preview.data?.version;
  const paged = useQuery({
    queryKey: ['inventory', wsId, 'season-merge-page', actorId, token, page],
    queryFn: () =>
      previewInventorySeasonMerge(wsId, {
        sourceId,
        targetId,
        version: token,
        page,
      }),
    enabled: valid && !reviewLocked && !!token && page > 1,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const query = page === 1 ? preview : paged;
  const data = valid && !reviewLocked ? query.data : undefined;
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
  const mutation = recovery.mutation;
  const submit = () => {
    if (
      !ready ||
      confirmed !== token ||
      !token ||
      !data ||
      !descriptionPolicy ||
      !rulePolicy ||
      !pricePolicy
    )
      return;
    mutation.mutate(
      Object.freeze({
        actorId,
        wsId,
        sourceName: data.source.name,
        targetName: data.target.name,
        payload: Object.freeze({
          sourceId,
          targetId,
          version: token,
          descriptionPolicy,
          rulePolicy,
          pricePolicy,
        }),
      })
    );
  };
  const previousScope = useRef({ actorId, wsId });
  useEffect(() => {
    if (
      previousScope.current.actorId === actorId &&
      previousScope.current.wsId === wsId
    )
      return;
    previousScope.current = { actorId, wsId };
    setSourceId('');
    setTargetId('');
    setDescription('');
    setRules('');
    setPrices('');
    setConfirmed(null);
    setReviewedVersion(null);
    setReviewedPage(0);
    setPage(1);
  }, [actorId, wsId]);
  const refresh = () => {
    if (recovery.request || recovery.pending) return;
    if (recovery.storageError) {
      recovery.refreshStorage();
      return;
    }
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
  const pending = recovery.pending;
  const ready = reviewReady && !recovery.error && !reviewLocked;
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
    recovery,
    reviewLocked,
    submit,
    refresh,
    change,
  };
}

'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  GitMerge,
  Loader2,
  RefreshCw,
  Users,
} from '@tuturuuu/icons';
import type {
  BulkMergeUsersResponse,
  DuplicateCluster,
  DuplicateDetectionResponse,
  MergeResult,
} from '@tuturuuu/types/primitives';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
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
import { Progress } from '@tuturuuu/ui/progress';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { DuplicateClusterCard } from './duplicate-cluster-card';

interface Props {
  wsId: string;
  onMergeComplete?: () => void;
}

type DialogState = 'idle' | 'detecting' | 'reviewing' | 'merging';
type ClusterFilter = 'linked-virtual' | 'all';

export function DuplicateUsersDialog({ wsId, onMergeComplete }: Props) {
  const t = useTranslations('ws-users');
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<DialogState>('idle');
  const [progress, setProgress] = useState(0);
  const [allClusters, setAllClusters] = useState<DuplicateCluster[]>([]);
  const [clusterFilter, setClusterFilter] =
    useState<ClusterFilter>('linked-virtual');
  const [currentClusterIndex, setCurrentClusterIndex] = useState(0);
  const [selectedTargets, setSelectedTargets] = useState<Map<number, string>>(
    new Map()
  );
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);

  // Filter clusters based on selected filter
  // 'linked-virtual': Only clusters with at least one platform-linked user
  // 'all': All clusters including virtual-only merges
  const filteredClusters = useMemo(() => {
    if (clusterFilter === 'all') return allClusters;
    return allClusters.filter((cluster) =>
      cluster.users.some((user) => user.isLinked)
    );
  }, [allClusters, clusterFilter]);

  // Use filteredClusters for display, allClusters for bulk operations
  const clusters = filteredClusters;

  const resetState = () => {
    setState('idle');
    setProgress(0);
    setAllClusters([]);
    setClusterFilter('linked-virtual');
    setCurrentClusterIndex(0);
    setSelectedTargets(new Map());
    setShowMergeConfirm(false);
  };

  const handlePreviousCluster = () => {
    if (currentClusterIndex > 0) {
      setCurrentClusterIndex((prev) => prev - 1);
    }
  };

  const handleNextCluster = () => {
    if (currentClusterIndex < clusters.length - 1) {
      setCurrentClusterIndex((prev) => prev + 1);
    }
  };

  const handleDetectDuplicates = async () => {
    try {
      setState('detecting');
      setProgress(0);

      setProgress(20);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/duplicates/detect`,
        { method: 'POST' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to detect duplicates');
      }

      setProgress(60);

      const data: DuplicateDetectionResponse = await response.json();
      setProgress(100);

      if (data.clusters.length === 0) {
        toast.success(t('no_duplicates_found'));
        setState('idle');
      } else {
        // Sort clusters: linked+virtual first, then virtual+virtual
        const sortedClusters = [...data.clusters].sort((a, b) => {
          const aHasLinked = a.users.some((u) => u.isLinked);
          const bHasLinked = b.users.some((u) => u.isLinked);
          if (aHasLinked && !bHasLinked) return -1;
          if (!aHasLinked && bHasLinked) return 1;
          return 0;
        });
        setAllClusters(sortedClusters);

        // Initialize selected targets with suggested targets
        const initialTargets = new Map<number, string>();
        for (const cluster of data.clusters) {
          initialTargets.set(cluster.clusterId, cluster.suggestedTargetId);
        }
        setSelectedTargets(initialTargets);

        setState('reviewing');
        setCurrentClusterIndex(0);
      }
    } catch (error) {
      console.error('Error detecting duplicates:', error);
      toast.error(t('duplicate_detect_failed'));
      setState('idle');
    }
  };

  const handleMergeSingle = async (
    cluster: DuplicateCluster,
    targetId: string
  ) => {
    try {
      setState('merging');
      setProgress(0);

      // Get source IDs (all users that are NOT the target)
      const sourceUsers = cluster.users.filter((u) => u.id !== targetId);
      if (sourceUsers.length === 0) {
        throw new Error('No source user found');
      }

      // For now, merge one at a time (first source user)
      const sourceUser = sourceUsers[0];
      if (!sourceUser) {
        throw new Error('No source user found');
      }

      setProgress(30);

      const response = await fetch(`/api/v1/workspaces/${wsId}/users/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: sourceUser.id,
          targetId: targetId,
        }),
      });

      setProgress(70);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to merge users');
      }

      const result: MergeResult = await response.json();
      setProgress(100);

      if (result.success) {
        toast.success(t('duplicate_merge_success'));

        // Remove the merged cluster from allClusters
        const remainingClusters = allClusters.filter(
          (c) => c.clusterId !== cluster.clusterId
        );
        setAllClusters(remainingClusters);

        // Check if there are any remaining filtered clusters
        const remainingFiltered =
          clusterFilter === 'all'
            ? remainingClusters
            : remainingClusters.filter((c) => c.users.some((u) => u.isLinked));

        if (remainingFiltered.length === 0) {
          handleMergeComplete();
        } else {
          // Adjust index if needed
          if (currentClusterIndex >= remainingFiltered.length) {
            setCurrentClusterIndex(remainingFiltered.length - 1);
          }
          setState('reviewing');
        }
      } else {
        throw new Error(result.error || 'Merge failed');
      }
    } catch (error) {
      console.error('Error merging users:', error);
      toast.error(t('duplicate_merge_failed'));
      setState('reviewing');
    }
  };

  const handleBulkMerge = async () => {
    setShowBulkConfirm(false);

    try {
      setState('merging');
      setProgress(0);

      // Build merge requests for filtered clusters only
      const merges = filteredClusters.map((cluster) => {
        const targetId = selectedTargets.get(cluster.clusterId);
        const sourceUser = cluster.users.find((u) => u.id !== targetId);
        return {
          sourceId: sourceUser!.id,
          targetId: targetId!,
        };
      });

      setProgress(20);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/merge/bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merges }),
        }
      );

      setProgress(80);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to bulk merge users');
      }

      const result: BulkMergeUsersResponse = await response.json();
      setProgress(100);

      if (result.failCount > 0) {
        toast.warning(
          t('duplicate_bulk_result', {
            success: result.successCount,
            fail: result.failCount,
          })
        );
      } else {
        toast.success(t('duplicate_process_complete'));
      }

      handleMergeComplete();
    } catch (error) {
      console.error('Error in bulk merge:', error);
      toast.error(t('duplicate_merge_failed'));
      setState('reviewing');
    }
  };

  const handleMergeComplete = () => {
    setState('idle');
    setAllClusters([]);
    queryClient.invalidateQueries({
      queryKey: ['workspace-users', wsId],
    });
    onMergeComplete?.();
  };

  const handleTargetChange = (clusterId: number, targetId: string) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev);
      next.set(clusterId, targetId);
      return next;
    });
  };

  // Handle filter change - reset to first cluster
  const handleFilterChange = (value: ClusterFilter) => {
    setClusterFilter(value);
    setCurrentClusterIndex(0);
  };

  const currentCluster = clusters[currentClusterIndex];
  const currentTargetId = currentCluster
    ? selectedTargets.get(currentCluster.clusterId) ||
      currentCluster.suggestedTargetId
    : '';

  // Get source users for merge confirmation (all non-target users)
  const sourceUsersForConfirm = currentCluster
    ? currentCluster.users.filter((u) => u.id !== currentTargetId)
    : [];

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetState();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Users className="mr-2 h-4 w-4" />
            {t('duplicates')}
          </Button>
        </DialogTrigger>

        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-[650px]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t('duplicates')}</DialogTitle>
            <DialogDescription>{t('duplicates_description')}</DialogDescription>
          </DialogHeader>

          {/* Idle state - clean UI with detect button */}
          {state === 'idle' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-center text-muted-foreground text-sm">
                {t('duplicate_idle_description')}
              </p>
            </div>
          )}

          {/* Detecting/Merging state - show progress */}
          {(state === 'detecting' || state === 'merging') && (
            <div className="flex flex-1 flex-col justify-center gap-4 py-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    {state === 'detecting'
                      ? t('duplicate_detecting')
                      : t('duplicate_merging')}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {progress}%
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </div>
          )}

          {/* Reviewing state - no clusters match filter */}
          {state === 'reviewing' &&
            !currentCluster &&
            allClusters.length > 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
                <Users className="h-12 w-12 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="font-medium text-sm">
                    {t('no_linked_duplicates')}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('no_linked_duplicates_hint', {
                      count: allClusters.length,
                    })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange('all')}
                >
                  {t('show_all_duplicates')}
                </Button>
              </div>
            )}

          {/* Reviewing state - show cluster card */}
          {state === 'reviewing' && currentCluster && (
            <div className="flex flex-1 flex-col gap-4 overflow-hidden">
              {/* Filter and navigation header */}
              <div className="flex shrink-0 flex-col gap-3">
                {/* Filter row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={clusterFilter}
                      onValueChange={(v) =>
                        handleFilterChange(v as ClusterFilter)
                      }
                    >
                      <SelectTrigger className="h-8 w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="linked-virtual">
                          {t('filter_linked_virtual')}
                        </SelectItem>
                        <SelectItem value="all">
                          {t('filter_all_duplicates')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {filteredClusters.length} / {allClusters.length}{' '}
                    {t('clusters')}
                  </Badge>
                </div>

                {/* Navigation row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handlePreviousCluster}
                      disabled={currentClusterIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Badge variant="secondary" className="px-3 py-1">
                      {currentClusterIndex + 1} / {clusters.length}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleNextCluster}
                      disabled={currentClusterIndex >= clusters.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkConfirm(true)}
                  >
                    <GitMerge className="mr-2 h-4 w-4" />
                    {t('bulk_merge')}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Cluster card with scroll */}
              <ScrollArea className="flex-1">
                <DuplicateClusterCard
                  cluster={currentCluster}
                  selectedTargetId={currentTargetId}
                  onTargetChange={(id) =>
                    handleTargetChange(currentCluster.clusterId, id)
                  }
                />
              </ScrollArea>
            </div>
          )}

          <DialogFooter className="shrink-0">
            {state === 'idle' && (
              <Button onClick={handleDetectDuplicates} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('detect_duplicates')}
              </Button>
            )}

            {state === 'reviewing' && currentCluster && (
              <Button
                onClick={() => setShowMergeConfirm(true)}
                className="w-full"
              >
                <GitMerge className="mr-2 h-4 w-4" />
                {t('merge_users')}
              </Button>
            )}

            {(state === 'detecting' || state === 'merging') && (
              <Button disabled className="w-full">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {state === 'detecting'
                  ? t('detecting')
                  : t('duplicate_merging')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk merge confirmation */}
      <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bulk_merge_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bulk_merge_confirm_description', {
                count: filteredClusters.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkMerge}>
              {t('bulk_merge')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single merge confirmation */}
      <AlertDialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('merge_confirm')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {sourceUsersForConfirm.length === 1
                    ? t('merge_confirm_description', {
                        source:
                          sourceUsersForConfirm[0]?.fullName ||
                          sourceUsersForConfirm[0]?.id ||
                          'Unknown',
                        target:
                          currentCluster?.users.find(
                            (u) => u.id === currentTargetId
                          )?.fullName || currentTargetId,
                      })
                    : t('merge_confirm_description_multiple', {
                        count: sourceUsersForConfirm.length,
                        target:
                          currentCluster?.users.find(
                            (u) => u.id === currentTargetId
                          )?.fullName || currentTargetId,
                      })}
                </p>
                <p className="font-medium text-destructive">
                  {t('merge_warning')}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMergeConfirm(false);
                if (currentCluster) {
                  handleMergeSingle(currentCluster, currentTargetId);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('merge_users')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

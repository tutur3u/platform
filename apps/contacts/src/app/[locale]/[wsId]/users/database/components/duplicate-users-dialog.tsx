'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
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
  PhasedMergeResult,
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
import { useCallback, useMemo, useState } from 'react';
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
  const [lastMergeResult, setLastMergeResult] = useState<MergeResult | null>(
    null
  );
  const [showCollisionWarning, setShowCollisionWarning] = useState(false);

  // Progress tracking for phased merge
  const [mergePhase, setMergePhase] = useState<string>('');
  const [currentTable, setCurrentTable] = useState<string>('');
  const [tablesCompleted, setTablesCompleted] = useState<number>(0);
  const [finalPhaseCompleted, setFinalPhaseCompleted] = useState<number>(0);

  // Total operations: 26 table/column pairs + 4 final phases
  const TOTAL_TABLES = 26;
  const TOTAL_FINAL_PHASES = 4; // phases 2, 3, 4, 5

  // Phase display names for final phases
  const FINAL_PHASE_NAMES: Record<number, string> = {
    2: 'Composite records',
    3: 'Custom fields',
    4: 'Platform link',
    5: 'Final cleanup',
  };

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
    setLastMergeResult(null);
    setShowCollisionWarning(false);
    setMergePhase('');
    setCurrentTable('');
    setTablesCompleted(0);
    setFinalPhaseCompleted(0);
  };

  // Check if a cluster has both users linked to different platform accounts
  const isBothLinkedCluster = useCallback(
    (cluster: DuplicateCluster, targetId: string) => {
      const sourceUsers = cluster.users.filter((u) => u.id !== targetId);
      const targetUser = cluster.users.find((u) => u.id === targetId);

      if (!targetUser) return false;

      // Check if target is linked
      if (!targetUser.isLinked) return false;

      // Check if any source user is also linked (to a different platform user)
      return sourceUsers.some(
        (source) =>
          source.isLinked &&
          source.linkedPlatformUserId !== targetUser.linkedPlatformUserId
      );
    },
    []
  );

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
    const MAX_RETRIES = 5;

    try {
      setState('merging');
      setProgress(0);
      setMergePhase('Starting...');
      setCurrentTable('');
      setTablesCompleted(0);
      setFinalPhaseCompleted(0);

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

      setMergePhase('Migrating data...');

      // Automatic retry loop: if the server returns a partial completion
      // (e.g. timeout on a specific table), we resume from where it left off
      let nextTableIndex = 0;
      let retries = 0;
      let finalResult: PhasedMergeResult | null = null;

      while (retries < MAX_RETRIES) {
        const response = await fetch(`/api/v1/workspaces/${wsId}/users/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: sourceUser.id,
            targetId: targetId,
            startTableIndex: nextTableIndex,
          }),
        });

        const result: PhasedMergeResult = await response.json();

        // Update progress based on completed operations
        const totalOps = TOTAL_TABLES + TOTAL_FINAL_PHASES;

        if (result.phaseResults && result.phaseResults.length > 0) {
          const phase1Result = result.phaseResults.find((p) => p.phase === 1);
          if (phase1Result) {
            setTablesCompleted(TOTAL_TABLES);
          }

          const finalPhasesCompleted = result.phaseResults.filter(
            (p) => typeof p.phase === 'number' && p.phase >= 2 && p.phase <= 5
          ).length;
          setFinalPhaseCompleted(finalPhasesCompleted);

          const completedOps =
            (phase1Result ? TOTAL_TABLES : 0) + finalPhasesCompleted;
          setProgress(Math.round((completedOps / totalOps) * 100));
        }

        // If partial with a nextTableIndex, automatically retry from there
        if (
          result.partial &&
          !result.success &&
          result.nextTableIndex != null
        ) {
          nextTableIndex = result.nextTableIndex;
          retries++;

          // Show current progress to user
          if (result.currentTable) {
            setCurrentTable(result.currentTable);
            setMergePhase(
              `Retrying from ${result.currentTable} (attempt ${retries + 1}/${MAX_RETRIES})...`
            );
          }

          // Update table progress based on completed index
          if (result.completedTableIndex != null) {
            setTablesCompleted(
              Math.min(result.completedTableIndex + 1, TOTAL_TABLES)
            );
            setProgress(
              Math.round(((result.completedTableIndex + 1) / totalOps) * 100)
            );
          }

          continue;
        }

        // If partial failure for a different reason (phase 2-5 timeout), stop
        if (result.partial && !result.success) {
          if (result.nextPhase) {
            const phaseName =
              FINAL_PHASE_NAMES[result.nextPhase] ??
              `Phase ${result.nextPhase}`;
            setMergePhase(`Paused at: ${phaseName}`);
          }
          toast.warning(
            'Merge paused due to an error. Please try again to continue.'
          );
          setState('reviewing');
          return;
        }

        if (!response.ok && !result.success) {
          throw new Error(result.error || 'Failed to merge users');
        }

        // Success!
        finalResult = result;
        break;
      }

      // Exhausted retries without success
      if (!finalResult) {
        toast.warning(
          `Merge could not complete after ${MAX_RETRIES} retries. Please try again.`
        );
        setState('reviewing');
        return;
      }

      setProgress(100);
      setMergePhase('Complete!');
      setTablesCompleted(TOTAL_TABLES);
      setFinalPhaseCompleted(TOTAL_FINAL_PHASES);

      if (finalResult.success) {
        // Check if there were collisions (data loss)
        if (
          finalResult.collisionTables &&
          finalResult.collisionTables.length > 0
        ) {
          setLastMergeResult(finalResult);
          setShowCollisionWarning(true);
          toast.warning(t('merge_collision_occurred'));
        } else {
          toast.success(t('duplicate_merge_success'));
        }

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
        throw new Error(finalResult.error || 'Merge failed');
      }
    } catch (error) {
      console.error('Error merging users:', error);
      toast.error(t('duplicate_merge_failed'));
      setMergePhase('Failed');
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

        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-162.5">
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
              <div className="space-y-4">
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

                {/* Progress details for merging state */}
                {state === 'merging' && mergePhase && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-muted-foreground">
                        {mergePhase}
                      </span>
                    </div>

                    {/* Current table being processed */}
                    {currentTable && (
                      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">
                          Processing:{' '}
                        </span>
                        <span className="font-mono">{currentTable}</span>
                      </div>
                    )}

                    {/* Progress indicators - simplified view */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Tables migration progress */}
                      <div
                        className={`flex flex-col items-center gap-1 rounded-md p-3 text-xs ${
                          tablesCompleted >= TOTAL_TABLES
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : tablesCompleted > 0
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          {tablesCompleted >= TOTAL_TABLES ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : tablesCompleted > 0 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          <span className="font-medium">Data Migration</span>
                        </div>
                        <span className="text-[10px]">
                          {tablesCompleted >= TOTAL_TABLES
                            ? 'Complete'
                            : `${TOTAL_TABLES} tables`}
                        </span>
                      </div>

                      {/* Final phases progress */}
                      <div
                        className={`flex flex-col items-center gap-1 rounded-md p-3 text-xs ${
                          finalPhaseCompleted >= TOTAL_FINAL_PHASES
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : finalPhaseCompleted > 0 ||
                                tablesCompleted >= TOTAL_TABLES
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          {finalPhaseCompleted >= TOTAL_FINAL_PHASES ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : finalPhaseCompleted > 0 ||
                            tablesCompleted >= TOTAL_TABLES ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          <span className="font-medium">Finalization</span>
                        </div>
                        <span className="text-[10px]">
                          {finalPhaseCompleted >= TOTAL_FINAL_PHASES
                            ? 'Complete'
                            : `${finalPhaseCompleted}/${TOTAL_FINAL_PHASES} phases`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
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
                      <SelectTrigger className="h-8 w-45">
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
                {currentCluster &&
                  isBothLinkedCluster(currentCluster, currentTargetId) && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-destructive text-sm">
                        {t('both_linked_warning')}
                      </p>
                    </div>
                  )}
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
              disabled={
                currentCluster !== undefined &&
                isBothLinkedCluster(currentCluster, currentTargetId)
              }
            >
              {t('merge_users')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Collision warning dialog */}
      <AlertDialog
        open={showCollisionWarning}
        onOpenChange={setShowCollisionWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('collision_warning_title')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t('collision_warning_description')}</p>
                {lastMergeResult?.collisionDetails &&
                  lastMergeResult.collisionDetails.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-medium text-sm">
                        {t('collision_affected_tables')}:
                      </p>
                      <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
                        {lastMergeResult.collisionDetails.map(
                          (detail, index) => (
                            <li key={index}>
                              <span className="font-mono">{detail.table}</span>:{' '}
                              {t('collision_records_deleted', {
                                count: detail.deleted_count,
                              })}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                <p className="text-muted-foreground text-sm">
                  {t('collision_warning_note')}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowCollisionWarning(false)}>
              {t('collision_understood')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

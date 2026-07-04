'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Search, Users } from '@tuturuuu/icons';
import {
  createWorkspaceHabitTracker,
  createWorkspaceHabitTrackerEntry,
  createWorkspaceHabitTrackerStreakAction,
  deleteWorkspaceHabitTracker,
  deleteWorkspaceHabitTrackerEntry,
  getWorkspaceHabitTracker,
  listWorkspaceHabitTrackers,
  updateWorkspaceHabitTracker,
} from '@tuturuuu/internal-api';
import type {
  HabitTracker,
  HabitTrackerEntryInput,
  HabitTrackerInput,
  HabitTrackerScope,
  HabitTrackerStreakActionInput,
} from '@tuturuuu/types/primitives/HabitTracker';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useDeferredValue, useEffect, useState } from 'react';
import TrackerCard from './tracker-card';
import TrackerDetailSheet from './tracker-detail-sheet';
import TrackerFormDialog from './tracker-form-dialog';
import { formatCompactNumber } from './tracker-shared';

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background/80 px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 font-semibold text-2xl">
        {formatCompactNumber(value)}
      </p>
    </div>
  );
}

function ListLoadingState() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card className="rounded-[24px]" key={index}>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full max-w-56" />
              </div>
            </div>
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-11 w-full rounded-2xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  const t = useTranslations('habit-tracker');

  return (
    <Card className="rounded-[28px] border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="rounded-full border border-border/70 bg-muted/40 px-4 py-2 text-muted-foreground text-sm">
          {t('title')}
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-xl">{title}</p>
          <p className="max-w-md text-muted-foreground text-sm">
            {description}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export default function HabitsClientPage({ wsId }: { wsId: string }) {
  const t = useTranslations('habit-tracker');
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingTracker, setEditingTracker] = useState<HabitTracker | null>(
    null
  );
  const [memberId, setMemberId] = useState<string | undefined>();
  const [quickValues, setQuickValues] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<HabitTrackerScope>('self');
  const [search, setSearch] = useState('');
  const [selectedTrackerId, setSelectedTrackerId] = useState<
    string | undefined
  >();
  const deferredSearch = useDeferredValue(search);

  const listQuery = useQuery({
    queryKey: ['habit-trackers', wsId, scope, memberId],
    queryFn: () =>
      listWorkspaceHabitTrackers(wsId, {
        scope,
        userId: scope === 'member' ? memberId : undefined,
      }),
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    enabled: Boolean(selectedTrackerId),
    queryFn: () =>
      getWorkspaceHabitTracker(wsId, selectedTrackerId as string, {
        scope,
        userId: scope === 'member' ? memberId : undefined,
      }),
    queryKey: ['habit-tracker', wsId, selectedTrackerId, scope, memberId],
  });

  useEffect(() => {
    if (scope !== 'member') return;

    const members = listQuery.data?.members ?? [];
    if (members.length === 0) {
      setMemberId(undefined);
      return;
    }

    if (!memberId || !members.some((member) => member.user_id === memberId)) {
      setMemberId(members[0]?.user_id);
    }
  }, [listQuery.data?.members, memberId, scope]);

  const trackers = listQuery.data?.trackers ?? [];
  const filteredTrackers = trackers.filter((tracker) =>
    `${tracker.tracker.name} ${tracker.tracker.description ?? ''}`
      .toLowerCase()
      .includes(deferredSearch.toLowerCase())
  );

  useEffect(() => {
    if (filteredTrackers.length === 0) {
      if (trackers.length === 0) {
        setSelectedTrackerId(undefined);
      }
      return;
    }

    if (
      !selectedTrackerId ||
      !filteredTrackers.some(
        (tracker) => tracker.tracker.id === selectedTrackerId
      )
    ) {
      setSelectedTrackerId(filteredTrackers[0]?.tracker.id);
    }
  }, [filteredTrackers, selectedTrackerId, trackers.length]);

  const createMutation = useMutation({
    mutationFn: (input: HabitTrackerInput) =>
      createWorkspaceHabitTracker(wsId, input),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('generic_error'));
    },
    onSuccess: async (tracker) => {
      setCreateDialogOpen(false);
      setSearch('');
      setSelectedTrackerId(tracker.id);
      await queryClient.invalidateQueries({
        queryKey: ['habit-trackers', wsId],
      });
      toast.success(t('tracker_created'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      input,
      trackerId,
    }: {
      input: Partial<HabitTrackerInput>;
      trackerId: string;
    }) => updateWorkspaceHabitTracker(wsId, trackerId, input),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('generic_error'));
    },
    onSuccess: async (tracker) => {
      setEditingTracker(null);
      setSelectedTrackerId(tracker.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['habit-trackers', wsId] }),
        queryClient.invalidateQueries({ queryKey: ['habit-tracker', wsId] }),
      ]);
      toast.success(t('tracker_updated'));
    },
  });

  const quickLogMutation = useMutation({
    mutationFn: ({
      input,
      trackerId,
    }: {
      input: HabitTrackerEntryInput;
      trackerId: string;
    }) => createWorkspaceHabitTrackerEntry(wsId, trackerId, input),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('generic_error'));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['habit-trackers', wsId] }),
        queryClient.invalidateQueries({ queryKey: ['habit-tracker', wsId] }),
      ]);
      toast.success(t('entry_saved'));
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: ({
      entryId,
      trackerId,
    }: {
      entryId: string;
      trackerId: string;
    }) => deleteWorkspaceHabitTrackerEntry(wsId, trackerId, entryId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('generic_error'));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['habit-trackers', wsId] }),
        queryClient.invalidateQueries({ queryKey: ['habit-tracker', wsId] }),
      ]);
      toast.success(t('entry_deleted'));
    },
  });

  const streakActionMutation = useMutation({
    mutationFn: ({
      input,
      trackerId,
    }: {
      input: HabitTrackerStreakActionInput;
      trackerId: string;
    }) => createWorkspaceHabitTrackerStreakAction(wsId, trackerId, input),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('generic_error'));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['habit-trackers', wsId] }),
        queryClient.invalidateQueries({ queryKey: ['habit-tracker', wsId] }),
      ]);
      toast.success(t('streak_updated'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (trackerId: string) =>
      deleteWorkspaceHabitTracker(wsId, trackerId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('generic_error'));
    },
    onSuccess: async () => {
      setDetailOpen(false);
      setSelectedTrackerId(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['habit-trackers', wsId] }),
        queryClient.invalidateQueries({ queryKey: ['habit-tracker', wsId] }),
      ]);
      toast.success(t('tracker_archived'));
    },
  });

  const summary = {
    currentVolume: filteredTrackers.reduce((sum, tracker) => {
      if (scope === 'team') {
        return sum + (tracker.team?.total_value ?? 0);
      }

      return sum + (tracker.current_member?.current_period_total ?? 0);
    }, 0),
    metTarget: filteredTrackers.filter((tracker) => {
      if (scope === 'team') {
        return (tracker.team?.total_entries ?? 0) > 0;
      }

      return (
        (tracker.current_member?.current_period_total ?? 0) >=
        tracker.tracker.target_value
      );
    }).length,
    topStreak: Math.max(
      0,
      ...filteredTrackers.map((tracker) =>
        scope === 'team'
          ? (tracker.team?.top_streak ?? 0)
          : (tracker.current_member?.streak.current_streak ?? 0)
      )
    ),
    totalTrackers: filteredTrackers.length,
  };

  function handleSelectTracker(trackerId: string) {
    setSelectedTrackerId(trackerId);
    setDetailOpen(true);
  }

  return (
    <>
      <TrackerFormDialog
        onOpenChange={setCreateDialogOpen}
        onSubmit={async (input) => {
          await createMutation.mutateAsync(input);
        }}
        open={createDialogOpen}
        submitting={createMutation.isPending}
      />

      <TrackerFormDialog
        onOpenChange={(open) => {
          if (!open) {
            setEditingTracker(null);
          }
        }}
        onSubmit={async (input) => {
          if (!editingTracker) return;
          await updateMutation.mutateAsync({
            input,
            trackerId: editingTracker.id,
          });
        }}
        open={Boolean(editingTracker)}
        submitting={updateMutation.isPending}
        tracker={editingTracker}
      />

      <TrackerDetailSheet
        archiving={archiveMutation.isPending}
        currentUserId={listQuery.data?.viewerUserId ?? ''}
        detail={detailQuery.data}
        loading={detailQuery.isLoading}
        onArchive={() => {
          if (!selectedTrackerId) return;
          archiveMutation.mutate(selectedTrackerId);
        }}
        onCreateEntry={async (input) => {
          if (!selectedTrackerId) return;
          await quickLogMutation.mutateAsync({
            input,
            trackerId: selectedTrackerId,
          });
        }}
        onDeleteEntry={async (entryId) => {
          if (!selectedTrackerId) return;
          await deleteEntryMutation.mutateAsync({
            entryId,
            trackerId: selectedTrackerId,
          });
        }}
        onEdit={() => {
          if (detailQuery.data?.tracker) {
            setEditingTracker(detailQuery.data.tracker);
          }
        }}
        onOpenChange={setDetailOpen}
        onRefresh={() => detailQuery.refetch()}
        onStreakAction={async (input) => {
          if (!selectedTrackerId) return;
          await streakActionMutation.mutateAsync({
            input,
            trackerId: selectedTrackerId,
          });
        }}
        open={detailOpen}
        refreshing={detailQuery.isFetching}
        scope={scope}
      />

      <div className="space-y-5 pb-6">
        <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr),minmax(360px,0.74fr)] min-[1120px]:grid-cols-[minmax(0,1.45fr),minmax(320px,0.78fr)]">
          <div className="overflow-hidden rounded-[32px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.08),transparent_26%)] bg-card/80">
            <div className="flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <Badge variant="outline">{t('badge')}</Badge>
                <div className="space-y-2">
                  <h1 className="font-semibold text-3xl tracking-tight">
                    {t('title')}
                  </h1>
                  <p className="max-w-2xl text-muted-foreground text-sm">
                    {t('description')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    queryClient.invalidateQueries({
                      queryKey: ['habit-trackers', wsId],
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('refresh')}
                </Button>
                <Button onClick={() => setCreateDialogOpen(true)} type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('create_tracker')}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 border-border/60 border-t px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryStat
                label={t('summary.total')}
                value={summary.totalTrackers}
              />
              <SummaryStat label={t('summary.met')} value={summary.metTarget} />
              <SummaryStat
                label={t('summary.streak')}
                value={summary.topStreak}
              />
              <SummaryStat
                label={t('summary.volume')}
                value={summary.currentVolume}
              />
            </div>
          </div>

          <section className="rounded-[28px] border border-border/70 bg-card/70 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              <span>{t('scope_title')}</span>
            </div>

            <div className="mt-4 space-y-4">
              <ToggleGroup
                className="w-full justify-start"
                onValueChange={(value) => {
                  if (!value) return;
                  setScope(value as HabitTrackerScope);
                }}
                type="single"
                value={scope}
                variant="outline"
              >
                <ToggleGroupItem className="px-4" value="self">
                  {t('scope_self')}
                </ToggleGroupItem>
                <ToggleGroupItem className="px-4" value="team">
                  {t('scope_team')}
                </ToggleGroupItem>
                <ToggleGroupItem className="px-4" value="member">
                  {t('scope_member')}
                </ToggleGroupItem>
              </ToggleGroup>

              <div className="space-y-2">
                <Label htmlFor="habit-search">{t('search_label')}</Label>
                <div className="relative">
                  <Search className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-10"
                    id="habit-search"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('search_placeholder')}
                    value={search}
                  />
                </div>
              </div>

              {scope === 'member' ? (
                <div className="space-y-2">
                  <Label>{t('member_label')}</Label>
                  <Select onValueChange={setMemberId} value={memberId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('member_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(listQuery.data?.members ?? []).map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              {t('scope_description')}
            </p>
          </section>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <div className="contents">
            {listQuery.isLoading ? (
              <ListLoadingState />
            ) : filteredTrackers.length === 0 ? (
              search ? (
                <EmptyState
                  action={
                    <Button
                      onClick={() => setSearch('')}
                      type="button"
                      variant="outline"
                    >
                      {t('clear_search')}
                    </Button>
                  }
                  description={t('empty_filtered_description')}
                  title={t('empty_filtered_title')}
                />
              ) : (
                <EmptyState
                  action={
                    <Button
                      onClick={() => setCreateDialogOpen(true)}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('create_tracker')}
                    </Button>
                  }
                  description={t('empty_state_description')}
                  title={t('empty_title')}
                />
              )
            ) : (
              filteredTrackers.map((tracker) => (
                <TrackerCard
                  key={tracker.tracker.id}
                  onOpenEdit={() => setEditingTracker(tracker.tracker)}
                  onQuickLog={(input) =>
                    quickLogMutation.mutate({
                      input,
                      trackerId: tracker.tracker.id,
                    })
                  }
                  onQuickValueChange={(value) =>
                    setQuickValues((current) => ({
                      ...current,
                      [tracker.tracker.id]: value,
                    }))
                  }
                  onSelect={() => handleSelectTracker(tracker.tracker.id)}
                  quickValue={quickValues[tracker.tracker.id]}
                  scope={scope}
                  selected={selectedTrackerId === tracker.tracker.id}
                  tracker={tracker}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}

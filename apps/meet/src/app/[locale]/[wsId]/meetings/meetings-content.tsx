'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { MeetingEntry } from '@/features/call/components/meeting-entry';
import {
  type ManageTarget,
  MeetingManageDialogs,
} from './components/meeting-manage-dialogs';
import { MeetingsHome } from './components/meetings-home';
import {
  classifyMeetings,
  DEFAULT_PAST_CHOICE,
} from './components/section-rules';
import type {
  MeetingManagement,
  MeetingsHomeState,
  PastCollapseChoice,
  PastController,
  PastFilter,
  PastResults,
} from './components/types';
import {
  meetingsQueryPrefix,
  scheduleFromMeetings,
  useMeetingPages,
} from './components/use-meeting-pages';

interface MeetingsContentProps {
  accountId: string;
  canCreate: boolean;
  wsId: string;
  /** Initial Past search, e.g. from `?search=`. */
  search: string;
  /** Saved Past collapse choice for this account and workspace. */
  initialPastChoice?: PastCollapseChoice;
}

export function MeetingsContent({
  accountId,
  canCreate,
  wsId,
  search: initialSearch,
  initialPastChoice = DEFAULT_PAST_CHOICE,
}: MeetingsContentProps) {
  const queryClient = useQueryClient();
  const [pastChoice, setPastChoice] = useState<PastCollapseChoice>(
    initialSearch ? 'expanded' : initialPastChoice
  );
  const [pastSearch, setPastSearch] = useState(initialSearch);
  const [pastFilter, setPastFilter] = useState<PastFilter>('all');
  const [target, setTarget] = useState<ManageTarget>({ kind: 'none' });
  const searchTerm = useDeferredValue(pastSearch.trim());
  const searching = searchTerm !== '';

  const base = useMeetingPages({ accountId, enabled: true, search: '', wsId });
  const matches = useMeetingPages({
    accountId,
    enabled: searching && pastChoice === 'expanded',
    search: searchTerm,
    wsId,
  });

  const updatedAt = base.query.dataUpdatedAt;
  const schedule = useMemo(
    () =>
      base.meetings
        ? scheduleFromMeetings(base.meetings, new Date(updatedAt).toISOString())
        : null,
    [base.meetings, updatedAt]
  );

  const state: MeetingsHomeState = schedule
    ? {
        kind: 'ready',
        schedule,
        sync: base.query.isRefetchError
          ? 'stale'
          : base.query.isFetching && !base.query.isFetchingNextPage
            ? 'refreshing'
            : 'fresh',
      }
    : base.query.isError
      ? { kind: 'error' }
      : { kind: 'loading' };

  const pastSource = searching ? matches : base;
  const pastMeetings = useMemo(() => {
    if (!searching) return schedule?.past;
    if (!matches.meetings) return undefined;
    return classifyMeetings(
      matches.meetings,
      new Date(matches.query.dataUpdatedAt).toISOString()
    ).past;
  }, [searching, schedule, matches.meetings, matches.query.dataUpdatedAt]);
  const results: PastResults = pastMeetings
    ? { kind: 'ready', meetings: pastMeetings, older: pastSource.older }
    : pastSource.query.isError
      ? { kind: 'error' }
      : { kind: 'loading' };

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: meetingsQueryPrefix(wsId, accountId),
    });

  const past: PastController = {
    choice: pastChoice,
    count: {
      loaded: pastMeetings?.length ?? 0,
      more: pastSource.older.kind !== 'complete',
    },
    filter: pastFilter,
    onChoiceChange: setPastChoice,
    onFilterChange: setPastFilter,
    onLoadOlder: () => void pastSource.query.fetchNextPage(),
    onRetry: () => void pastSource.query.refetch(),
    onSearchChange: setPastSearch,
    results,
    search: pastSearch,
  };

  const management: MeetingManagement = {
    onDelete: (meeting) => setTarget({ kind: 'delete', meeting }),
    onEdit: (meeting) => setTarget({ kind: 'edit', meeting }),
  };

  return (
    <>
      <div className="space-y-8">
        <MeetingEntry
          canCreate={canCreate}
          onCreated={() => void refresh()}
          wsId={wsId}
        />
        <MeetingsHome
          accountId={accountId}
          management={management}
          onRetry={() => void base.query.refetch()}
          past={past}
          state={state}
          wsId={wsId}
        />
      </div>
      <MeetingManageDialogs
        onChanged={() => void refresh()}
        onClose={() => setTarget({ kind: 'none' })}
        target={target}
        wsId={wsId}
      />
    </>
  );
}

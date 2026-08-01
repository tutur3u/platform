'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  Check,
  ExternalLink,
  LockKeyhole,
  RotateCcw,
} from '@tuturuuu/icons';
import {
  finalizeMeetPlan,
  type MeetPlanSnapshot,
  reopenMeetPlan,
} from '@tuturuuu/internal-api';
import type {
  MeetFinalizedTimeframe,
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
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
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Slider } from '@tuturuuu/ui/slider';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { createMeetIcs } from '../lib/meet-ics';
import {
  formatMinuteOfDay,
  type MeetRankedTimeframe,
  rankMeetTimeframes,
} from '../lib/meet-insights';
import { candidateToAbsoluteRange } from '../lib/meet-timezone';
import { meetPlanQueryKey } from './meet-query';

function candidateKey(candidate: MeetRankedTimeframe) {
  return `${candidate.date}:${candidate.startMinute}`;
}

export function MeetSuggestionsPanel({
  plan,
  users,
  timeblocks,
  finalizedTimeframes,
  isCreator,
}: {
  plan: MeetTogetherPlan;
  users: PlanUser[];
  timeblocks: Timeblock[];
  finalizedTimeframes: MeetFinalizedTimeframe[];
  isCreator: boolean;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { filteredUserIds } = useTimeBlocking();
  const [minimumOverlap, setMinimumOverlap] = useState(0);
  const [includeWeekends, setIncludeWeekends] = useState(true);
  const [includeTentative, setIncludeTentative] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [calendarDestination, setCalendarDestination] = useState('personal');
  const [calendarRange, setCalendarRange] = useState('all');
  const rankedUsers = useMemo(
    () =>
      filteredUserIds.length
        ? users.filter((user) => user.id && filteredUserIds.includes(user.id))
        : users,
    [filteredUserIds, users]
  );
  const ranked = useMemo(
    () =>
      rankMeetTimeframes({
        plan,
        users: rankedUsers,
        timeblocks,
        includeTentative,
      }),
    [includeTentative, plan, rankedUsers, timeblocks]
  );
  const visible = ranked.filter((candidate) => {
    const isWeekend = [0, 6].includes(dayjs(candidate.date).day());
    return (
      candidate.confirmedPercent >= minimumOverlap &&
      (includeWeekends || !isWeekend) &&
      candidateToAbsoluteRange(candidate, plan) !== null
    );
  });
  const queryKey = plan.id ? meetPlanQueryKey(plan.id) : ['meet-plan'];

  const mutation = useMutation({
    mutationFn: async (action: 'finalize' | 'reopen') => {
      if (!plan.id) throw new Error('Plan id is required');
      if (action === 'reopen') return reopenMeetPlan(plan.id);
      const timeframes = selected.flatMap((key) => {
        const candidate = ranked.find((item) => candidateKey(item) === key);
        const timeframe = candidate
          ? candidateToAbsoluteRange(candidate, plan)
          : null;
        return timeframe ? [timeframe] : [];
      });
      return finalizeMeetPlan(plan.id, { timeframes });
    },
    onMutate: async (action) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MeetPlanSnapshot>(queryKey);
      if (previous) {
        queryClient.setQueryData<MeetPlanSnapshot>(queryKey, {
          ...previous,
          plan: { ...previous.plan, is_confirmed: action === 'finalize' },
        });
      }
      return { previous };
    },
    onError: (_error, _action, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
      toast({
        title: t('finalization_failed'),
        description: t('finalization_failed_description'),
        variant: 'destructive',
      });
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKey, snapshot);
      setSelected([]);
    },
  });

  const downloadIcs = () => {
    if (!plan.id) return;
    const content = createMeetIcs({
      planId: plan.id,
      title: plan.name || t('tuturuuu_meet'),
      description: plan.description,
      timeframes: finalizedTimeframes,
    });
    const href = URL.createObjectURL(
      new Blob([content], { type: 'text/calendar' })
    );
    const link = document.createElement('a');
    link.href = href;
    link.download = `${plan.name || 'tuturuuu-meet'}.ics`;
    link.click();
    URL.revokeObjectURL(href);
  };

  const openCalendarHandoff = () => {
    if (!plan.id) return;
    const timeframes =
      calendarRange === 'all'
        ? finalizedTimeframes
        : finalizedTimeframes.filter(
            (timeframe) => timeframe.id === calendarRange
          );
    const query = new URLSearchParams({
      meetPlanId: plan.id,
      ranges: JSON.stringify(
        timeframes.map(({ start_at, end_at }) => ({
          startAt: start_at,
          endAt: end_at,
        }))
      ),
      title: plan.name || t('tuturuuu_meet'),
    });
    window.open(
      `https://calendar.tuturuuu.com/${calendarDestination}?${query}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  if (plan.is_confirmed) {
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border bg-primary/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className="mb-3 gap-1">
                <LockKeyhole className="h-3 w-3" /> {t('finalized')}
              </Badge>
              <h3 className="font-semibold text-lg">
                {t('locked_meeting_alternatives')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('locked_meeting_alternatives_description')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadIcs}>
                <CalendarCheck className="mr-2 h-4 w-4" />{' '}
                {t('download_calendar_file')}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />{' '}
                    {t('open_in_calendar')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('calendar_handoff_title')}</DialogTitle>
                    <DialogDescription>
                      {t('calendar_handoff_description')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm">
                      {t('calendar_destination')}
                      <Select
                        value={calendarDestination}
                        onValueChange={setCalendarDestination}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">
                            {t('personal_calendar')}
                          </SelectItem>
                          <SelectItem value="internal">
                            {t('workspace_calendar')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm">
                      {t('calendar_ranges')}
                      <Select
                        value={calendarRange}
                        onValueChange={setCalendarRange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {t('all_finalized_ranges')}
                          </SelectItem>
                          {finalizedTimeframes.map((timeframe, index) => (
                            <SelectItem key={timeframe.id} value={timeframe.id}>
                              {t('alternative_number', { number: index + 1 })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  <DialogFooter>
                    <Button onClick={openCalendarHandoff}>
                      {t('continue_to_calendar')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {finalizedTimeframes.map((timeframe, index) => (
              <div
                key={timeframe.id}
                className="rounded-xl border bg-background p-4"
              >
                <span className="text-muted-foreground text-xs">
                  {t('alternative_number', { number: index + 1 })}
                </span>
                <p className="mt-1 font-medium tabular-nums">
                  {dayjs(timeframe.start_at).format('ddd, MMM D · HH:mm')}–
                  {dayjs(timeframe.end_at).format('HH:mm')}
                </p>
              </div>
            ))}
          </div>
        </div>
        {isCreator && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost">
                <RotateCcw className="mr-2 h-4 w-4" /> {t('reopen_plan')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('reopen_availability_title')}</DialogTitle>
                <DialogDescription>
                  {t('reopen_availability_description')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  onClick={() => mutation.mutate('reopen')}
                  disabled={mutation.isPending}
                >
                  {t('reopen_plan')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </section>
    );
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="space-y-3">
        {visible.slice(0, 12).map((candidate, index) => {
          const key = candidateKey(candidate);
          const active = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (selected.includes(key)) {
                  setSelected((current) =>
                    current.filter((item) => item !== key)
                  );
                  return;
                }
                const overlaps = selected.some((selectedKey) => {
                  const selectedCandidate = ranked.find(
                    (item) => candidateKey(item) === selectedKey
                  );
                  return Boolean(
                    selectedCandidate &&
                      selectedCandidate.date === candidate.date &&
                      selectedCandidate.startMinute < candidate.endMinute &&
                      candidate.startMinute < selectedCandidate.endMinute
                  );
                });
                if (overlaps) {
                  toast({
                    title: t('overlapping_timeframes'),
                    description: t('overlapping_timeframes_description'),
                    variant: 'destructive',
                  });
                  return;
                }
                setSelected((current) => [...current, key]);
              }}
              className={cn(
                'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition duration-200 active:scale-[0.995]',
                active
                  ? 'border-primary bg-primary/[0.06]'
                  : 'bg-background hover:border-primary/40'
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-xs tabular-nums">
                {active ? <Check className="h-4 w-4" /> : `#${index + 1}`}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold tabular-nums">
                  {dayjs(candidate.date).format('ddd, MMM D')} ·{' '}
                  {formatMinuteOfDay(candidate.startMinute)}–
                  {formatMinuteOfDay(candidate.endMinute)}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {t('recommendation_coverage', {
                    confirmed: candidate.confirmedUserIds.length,
                    tentative: candidate.tentativeUserIds.length,
                    unavailable: candidate.unavailableUserIds.length,
                  })}
                </span>
              </span>
              <Badge
                variant={
                  candidate.confirmedPercent === 100 ? 'default' : 'secondary'
                }
                className="tabular-nums"
              >
                {Math.round(candidate.confirmedPercent)}%
              </Badge>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          {t('no_matching_suggestions')}
        </div>
      )}

      <aside className="h-fit space-y-5 rounded-2xl border bg-muted/20 p-4 lg:sticky lg:top-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{t('minimum_confirmed')}</span>
            <span className="tabular-nums">{minimumOverlap}%</span>
          </div>
          <Slider
            value={[minimumOverlap]}
            min={0}
            max={100}
            step={10}
            onValueChange={([value]) => setMinimumOverlap(value ?? 0)}
          />
        </div>
        <label className="flex items-center justify-between gap-4 text-sm">
          {t('include_weekends')}
          <Switch
            checked={includeWeekends}
            onCheckedChange={setIncludeWeekends}
          />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          {t('include_tentative')}
          <Switch
            checked={includeTentative}
            onCheckedChange={setIncludeTentative}
          />
        </label>
        {isCreator && (
          <Dialog>
            <DialogTrigger asChild>
              <Button className="w-full" disabled={selected.length === 0}>
                <LockKeyhole className="mr-2 h-4 w-4" />{' '}
                {t('finalize_timeframes', { count: selected.length })}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('finalize_selected_title')}</DialogTitle>
                <DialogDescription>
                  {t('finalize_selected_description')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  onClick={() => mutation.mutate('finalize')}
                  disabled={mutation.isPending}
                >
                  {t('finalize_plan')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </aside>
    </section>
  );
}

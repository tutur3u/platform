'use client';

import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  ExternalLink,
  Layers,
  MapPin,
  MoreHorizontal,
  Move,
  RefreshCw,
  RotateCcw,
  Trash2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Collapsible, CollapsibleContent } from '@tuturuuu/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatDuration } from '@/lib/time-format';
import type { SessionWithRelations } from '../../types';
import type { ActionStates, StackedSession, TaskWithDetails } from './session-types';
import { getCategoryColor } from './session-utils';

dayjs.extend(utc);
dayjs.extend(timezone);

interface StackedSessionItemProps {
  stackedSession: StackedSession | null;
  onResume: (session: SessionWithRelations) => void;
  onEdit: (session: SessionWithRelations) => void;
  onDelete: (session: SessionWithRelations) => void;
  onMove: (session: SessionWithRelations) => void;
  actionStates: ActionStates;
  tasks: TaskWithDetails[] | null;
}

export function StackedSessionItem({
  stackedSession,
  onResume,
  onEdit,
  onDelete,
  onMove,
  actionStates,
  tasks,
}: StackedSessionItemProps) {
  const t = useTranslations('time-tracker.session_history');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const userTimezone = dayjs.tz.guess();
  const firstStartTime = dayjs
    .utc(stackedSession?.firstStartTime)
    .tz(userTimezone);
  const lastEndTime = stackedSession?.lastEndTime
    ? dayjs.utc(stackedSession?.lastEndTime).tz(userTimezone)
    : null;

  const latestSession =
    stackedSession?.sessions[stackedSession?.sessions.length - 1];

  if (!latestSession) {
    return null;
  }

  // Limit how many sessions to show initially
  const INITIAL_SESSION_LIMIT = 3;
  const hasMoreSessions =
    stackedSession?.sessions.length > INITIAL_SESSION_LIMIT;
  const visibleSessions = showAllSessions
    ? stackedSession?.sessions
    : stackedSession?.sessions.slice(0, INITIAL_SESSION_LIMIT);

  return (
    <div className="group rounded-xl border border-border/60 bg-linear-to-br from-background to-muted/5 shadow-sm transition-all hover:border-border hover:shadow-md">
      <div className="p-3 md:p-5">
        {/* Mobile-optimized layout */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="min-w-0 flex-1 space-y-2 md:space-y-2.5">
            {/* Title row with duration on mobile */}
            <div className="flex items-start justify-between gap-2">
              <h4 className="wrap-break-word min-w-0 flex-1 font-semibold text-base leading-tight md:text-lg">
                {stackedSession?.title}
              </h4>
              {/* Duration badge - visible on mobile */}
              <div className="shrink-0 rounded-lg bg-dynamic-orange/10 px-2.5 py-1 ring-1 ring-dynamic-orange/20 md:hidden">
                <div className="font-bold font-mono text-dynamic-orange text-sm">
                  {formatDuration(stackedSession?.periodDuration)}
                </div>
              </div>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              {stackedSession?.sessions.length > 1 && (
                <Badge
                  variant="secondary"
                  className="shrink-0 font-medium text-xs shadow-sm"
                >
                  <Layers className="mr-1 h-3 w-3" />
                  {stackedSession?.sessions.length}
                </Badge>
              )}
              {/* Show manual entry badge if any session in the stack is a manual entry */}
              {stackedSession?.sessions.some(
                (s) =>
                  s.start_time &&
                  s.end_time &&
                  !s.is_running &&
                  s.duration_seconds
              ) &&
                stackedSession?.sessions.some((s) => {
                  const sessionStart = s.start_time
                    ? dayjs(s.start_time)
                    : null;
                  const sessionCreated = dayjs(s.created_at);

                  // If session was created after it ended, it's likely a manual entry
                  return (
                    s.end_time && !sessionStart?.isSame(sessionCreated, 'minute')
                  );
                }) && (
                  <Badge
                    variant="outline"
                    className="border-dynamic-orange/20 bg-dynamic-orange/10 font-medium text-dynamic-orange text-xs"
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    {t('manual')}
                  </Badge>
                )}
            </div>

            {/* Description */}
            {stackedSession?.description && (
              <p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
                {getDescriptionText(stackedSession.description)}
              </p>
            )}

            {/* Category and Task */}
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              {stackedSession?.category && (
                <Badge
                  className={cn(
                    'shrink-0 font-medium text-white text-xs shadow-sm',
                    getCategoryColor(stackedSession?.category.color || 'BLUE')
                  )}
                >
                  {stackedSession?.category.name}
                </Badge>
              )}
              {stackedSession?.task && (
                <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                  <CheckCircle className="h-3 w-3 shrink-0 text-dynamic-blue" />
                  <span className="truncate font-medium text-dynamic-blue text-xs">
                    {stackedSession?.task.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-3 w-3 shrink-0 p-0 text-dynamic-blue/60 hover:text-dynamic-blue"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="h-3 w-3" />
                <span>
                  {stackedSession?.sessions.length > 1 ? (
                    <>
                      {firstStartTime.format('MMM D')}
                      {lastEndTime &&
                        !firstStartTime.isSame(lastEndTime, 'day') && (
                          <span> - {lastEndTime.format('MMM D')}</span>
                        )}
                      <span className="ml-1">
                        ({stackedSession?.sessions.length} sessions)
                      </span>
                      {stackedSession?.sessions.some((s) => s.is_running) && (
                        <span className="font-medium text-green-600">
                          {' '}
                          • {t('ongoing')}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {firstStartTime.format('MMM D')} at{' '}
                      {firstStartTime.format('h:mm A')}
                      {lastEndTime ? (
                        <span> - {lastEndTime.format('h:mm A')}</span>
                      ) : stackedSession?.sessions.some((s) => s.is_running) ? (
                        <span className="font-medium text-green-600">
                          {' '}
                          - {t('ongoing')}
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Task location */}
            {stackedSession?.task &&
              (() => {
                const taskWithDetails = tasks?.find(
                  (t) => t.id === stackedSession?.task?.id
                );
                return taskWithDetails?.board_name &&
                  taskWithDetails?.list_name ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="break-all">
                      {taskWithDetails.board_name} • {taskWithDetails.list_name}
                    </span>
                  </div>
                ) : null;
              })()}
          </div>

          {/* Duration and Actions - desktop only */}
          <div className="hidden items-start gap-2 md:flex">
            <div className="shrink-0 rounded-lg bg-dynamic-orange/10 px-3 py-2 text-right ring-1 ring-dynamic-orange/20">
              <div className="font-bold font-mono text-dynamic-orange text-lg">
                {formatDuration(stackedSession?.periodDuration)}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {stackedSession?.sessions.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 transition-all hover:bg-muted md:h-10 md:w-10"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={
                    isExpanded
                      ? t('hide_individual_sessions')
                      : t('show_individual_sessions')
                  }
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 md:h-5 md:w-5" />
                  ) : (
                    <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />
                  )}
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 opacity-100 transition-opacity md:h-10 md:w-10 md:opacity-0 md:group-hover:opacity-100"
                    title={t('more_options')}
                  >
                    <MoreHorizontal className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onResume(latestSession)}
                    disabled={actionStates[`resume-${latestSession.id}`]}
                  >
                    {actionStates[`resume-${latestSession.id}`] ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    {t('start_new_session')}
                  </DropdownMenuItem>
                  {stackedSession?.sessions.length <= 1 && (
                    <>
                      <DropdownMenuItem onClick={() => onEdit(latestSession)}>
                        <Edit className="h-4 w-4" />
                        {t('edit_session')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMove(latestSession)}>
                        <Move className="h-4 w-4" />
                        {t('move_to_workspace')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(latestSession)}>
                        <Trash2 className="h-4 w-4" />
                        {t('delete_session')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Mobile action bar */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 md:hidden">
          <div className="flex items-center gap-1.5">
            {stackedSession?.sessions.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 flex-1"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="mr-1.5 h-4 w-4" />
                    {t('hide_details')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1.5 h-4 w-4" />
                    {t('show_sessions', {
                      count: stackedSession?.sessions.length,
                    })}
                  </>
                )}
              </Button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 px-3">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onResume(latestSession)}
                disabled={actionStates[`resume-${latestSession.id}`]}
              >
                {actionStates[`resume-${latestSession.id}`] ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {t('start_new_session')}
              </DropdownMenuItem>
              {stackedSession?.sessions.length <= 1 && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(latestSession)}>
                    <Edit className="h-4 w-4" />
                    {t('edit_session')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMove(latestSession)}>
                    <Move className="h-4 w-4" />
                    {t('move_to_workspace')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(latestSession)}>
                    <Trash2 className="h-4 w-4" />
                    {t('delete_session')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {stackedSession?.sessions.length > 1 && (
        <Collapsible open={isExpanded}>
          <CollapsibleContent>
            <div className="border-t bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <Layers className="h-4 w-4" />
                  {t('individual_sessions', {
                    count: stackedSession?.sessions.length,
                  })}
                  {stackedSession?.sessions.length > 1 && (
                    <span className="ml-1 text-xs">
                      •{' '}
                      {t('days_count', {
                        count: new Set(
                          stackedSession?.sessions.map((s) =>
                            dayjs
                              .utc(s.start_time)
                              .tz(userTimezone)
                              .format('MMM D')
                          )
                        ).size,
                      })}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('completed_count', {
                    completed: stackedSession?.sessions.filter(
                      (s) => s.end_time
                    ).length,
                  })}{' '}
                  •{' '}
                  {t('running_count', {
                    running: stackedSession?.sessions.filter(
                      (s) => s.is_running
                    ).length,
                  })}
                </div>
              </div>
              <div className="space-y-3">
                {/* Sessions container with scroll for many sessions */}
                <div
                  className={cn(
                    'space-y-2 transition-all duration-200',
                    stackedSession?.sessions.length > 6 &&
                      showAllSessions &&
                      'max-h-96 overflow-y-auto pr-2'
                  )}
                >
                  {visibleSessions.map((session, index) => (
                    <IndividualSessionRow
                      key={session.id}
                      session={session}
                      index={index}
                      stackedSession={stackedSession}
                      userTimezone={userTimezone}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onMove={onMove}
                    />
                  ))}
                </div>

                {/* Show more/less control for stacked sessions */}
                {hasMoreSessions && (
                  <div className="flex items-center justify-center pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllSessions(!showAllSessions)}
                      className="h-8 text-muted-foreground text-xs hover:text-foreground"
                    >
                      {showAllSessions ? (
                        <>
                          <ChevronUp className="mr-1 h-3 w-3" />
                          {t('show_less', {
                            shown: INITIAL_SESSION_LIMIT,
                            total: stackedSession?.sessions.length,
                          })}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1 h-3 w-3" />
                          {t('show_more_sessions', {
                            count:
                              stackedSession?.sessions.length -
                              INITIAL_SESSION_LIMIT,
                          })}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Individual session row within the expanded stacked view
interface IndividualSessionRowProps {
  session: SessionWithRelations;
  index: number;
  stackedSession: StackedSession;
  userTimezone: string;
  onEdit: (session: SessionWithRelations) => void;
  onDelete: (session: SessionWithRelations) => void;
  onMove: (session: SessionWithRelations) => void;
}

function IndividualSessionRow({
  session,
  index,
  stackedSession,
  userTimezone,
  onEdit,
  onDelete,
  onMove,
}: IndividualSessionRowProps) {
  const t = useTranslations('time-tracker.session_history');
  const sessionStart = dayjs.utc(session.start_time).tz(userTimezone);
  const sessionEnd = session.end_time
    ? dayjs.utc(session.end_time).tz(userTimezone)
    : null;

  // Calculate gap from previous session
  const prevSession = index > 0 ? stackedSession?.sessions[index - 1] : null;

  const gapInSeconds = prevSession?.end_time
    ? sessionStart.diff(
        dayjs.utc(prevSession.end_time).tz(userTimezone),
        'seconds'
      )
    : null;

  // Format gap duration based on length
  const formatGap = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Determine gap type for styling
  const getGapType = (seconds: number) => {
    if (seconds < 60) return 'minimal'; // Less than 1 minute
    if (seconds < 900) return 'short'; // Less than 15 minutes
    return 'long'; // 15+ minutes
  };

  // Handle edge cases for gap display
  const shouldShowGap =
    gapInSeconds !== null && gapInSeconds > 30 && gapInSeconds < 86400; // Only show gaps between 30 seconds and 24 hours
  const gapType =
    gapInSeconds && shouldShowGap ? getGapType(gapInSeconds) : null;

  // Detect overlapping sessions
  const isOverlapping = gapInSeconds !== null && gapInSeconds < 0;

  return (
    <div>
      {/* Show overlap warning */}
      {isOverlapping && (
        <div className="-mt-1 mb-2 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-amber-700 text-xs ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800">
            <div className="h-1 w-1 rounded-full bg-amber-500" />
            <span className="font-medium">{t('overlapping_session')}</span>
            <div className="h-1 w-1 rounded-full bg-amber-500" />
          </div>
        </div>
      )}

      {/* Show gap indicator based on duration */}
      {shouldShowGap && gapInSeconds && (
        <div className="-mt-1 mb-2 flex items-center justify-center">
          {gapType === 'minimal' ? (
            // Minimal gap - just small dots
            <div className="flex items-center gap-1">
              <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
            </div>
          ) : gapType === 'short' ? (
            // Short break - simple line with time
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <div className="h-px w-6 bg-border" />
              <span className="rounded bg-muted px-2 py-0.5 text-xs">
                {formatGap(gapInSeconds)}
              </span>
              <div className="h-px w-6 bg-border" />
            </div>
          ) : (
            // Long break - prominent break indicator
            <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-muted-foreground text-xs shadow-sm">
              <div className="h-1 w-8 bg-foreground/10" />
              <span className="font-medium">
                {formatGap(gapInSeconds)} {t('break')}
              </span>
              <div className="h-1 w-8 bg-foreground/10" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border bg-background p-3 text-sm transition-all hover:bg-muted/50 hover:shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full font-medium text-xs',
              session.is_running
                ? 'bg-green-100 text-green-700 ring-2 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-800'
                : 'bg-primary/10 text-primary'
            )}
          >
            {session.is_running ? (
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-600" />
            ) : (
              index + 1
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {sessionStart.format('h:mm A')}
                {sessionEnd && ` - ${sessionEnd.format('h:mm A')}`}
                {session.is_running && (
                  <span className="text-green-600"> - {t('ongoing')}</span>
                )}
              </span>
              <Badge variant="outline" className="text-xs">
                {sessionStart.format('MMM D')}
              </Badge>
            </div>
            {session.description &&
              session.description !== stackedSession?.description && (
                <p className="mt-1 line-clamp-1 whitespace-pre-wrap text-muted-foreground text-xs">
                  {getDescriptionText(session.description)}
                </p>
              )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-full flex-col items-center justify-center text-right">
            <span className="font-medium text-sm">
              {session.duration_seconds &&
                formatDuration(session.duration_seconds)}
            </span>
            {session.is_running && (
              <div>
                <Badge variant="secondary" className="text-xs">
                  <div className="mr-1 h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  {t('running')}
                </Badge>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(session)}>
                <Edit className="h-3 w-3" />
                {t('edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(session)}>
                <Move className="h-3 w-3" />
                {t('move')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(session)}>
                <Trash2 className="h-3 w-3" />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

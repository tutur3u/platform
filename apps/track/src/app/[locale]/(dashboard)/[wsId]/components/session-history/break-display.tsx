'use client';

import { useQuery } from '@tanstack/react-query';
import * as Icons from '@tuturuuu/icons';
import {
  listSessionBreakSummaries,
  listSessionBreaks,
  listWorkspaceBreakTypes,
  type WorkspaceBreakType,
} from '@tuturuuu/internal-api/time-tracking';
import dayjs from 'dayjs';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BREAK_COLOR_CLASSES,
  getBreakTypeColor,
  getIconComponent,
} from '@/hooks/useBreakTypeStyles';

interface BreakDisplayProps {
  sessionId: string;
}

/**
 * Format duration in seconds to human-readable string
 */
export const formatBreakDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

/**
 * Format time to HH:MM format in user's local timezone
 */
export const formatTime = (isoString: string): string => {
  return dayjs(isoString).format('h:mm A');
};

/**
 * Break Display Component - Shows breaks within a session
 * Displays break type, duration, and time information
 */
export function BreakDisplay({ sessionId }: BreakDisplayProps) {
  const t = useTranslations('time-tracker.breaks');
  const params = useParams<{ wsId: string | string[] }>();
  const wsId = Array.isArray(params.wsId) ? params.wsId[0] : params.wsId;

  const { data: breakTypes = [] } = useQuery<WorkspaceBreakType[]>({
    queryKey: ['workspace-break-types', wsId],
    queryFn: async () => {
      if (!wsId) return [];
      return listWorkspaceBreakTypes(wsId);
    },
    enabled: Boolean(wsId),
    staleTime: 5 * 60 * 1000,
  });

  const breakTypesById = new Map(
    breakTypes.map((breakType) => [breakType.id, breakType])
  );

  const { data: breaks, isLoading } = useQuery({
    queryKey: ['session-breaks', sessionId],
    queryFn: async () => {
      if (!wsId) return [];
      return listSessionBreaks(wsId, sessionId);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: Boolean(wsId),
  });

  if (isLoading) {
    return null;
  }

  if (!breaks || breaks.length === 0) {
    return null;
  }

  return (
    <div className="-mx-1 -my-0.5 space-y-2 rounded-lg bg-muted/40 px-2 py-2">
      <div className="flex items-center gap-2 px-1">
        <Icons.Pause className="h-3.5 w-3.5 text-muted-foreground/70" />
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t('title')}
        </h4>
      </div>
      <div className="space-y-1.5">
        {breaks.map((breakRecord) => {
          const breakType = breakRecord.break_type_id
            ? (breakTypesById.get(breakRecord.break_type_id) ?? null)
            : null;
          const breakTypeColor = getBreakTypeColor(breakType?.color);
          const breakClasses = BREAK_COLOR_CLASSES[breakTypeColor];
          const BreakIcon = getIconComponent(breakType?.icon);

          return (
            <div
              key={breakRecord.id}
              className={`flex items-center justify-between gap-2 rounded-md border ${breakClasses.border} ${breakClasses.bg} px-2.5 py-2`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <BreakIcon
                  className={`h-3.5 w-3.5 shrink-0 ${breakClasses.text}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`truncate font-semibold ${breakClasses.text} text-xs`}
                    >
                      {breakType?.name ||
                        breakRecord.break_type_name ||
                        t('unnamed_break')}
                    </span>
                    {!breakRecord.break_end && (
                      <span
                        className={`inline-block shrink-0 rounded-full ${breakClasses.badgeBg} px-1.5 py-0.5 ${breakClasses.text} font-medium text-xs`}
                      >
                        {t('active')}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs ${breakClasses.textMuted}`}>
                    {formatTime(breakRecord.break_start)}
                    {breakRecord.break_end && (
                      <>
                        <span className="mx-1">→</span>
                        {formatTime(breakRecord.break_end)}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div
                className={`shrink-0 font-mono font-semibold ${breakClasses.text} text-xs`}
              >
                {breakRecord.break_duration_seconds
                  ? formatBreakDuration(breakRecord.break_duration_seconds)
                  : t('ongoing')}
              </div>
            </div>
          );
        })}
      </div>
      {breaks.some((b) => {
        const breakType = b.break_type_id
          ? breakTypesById.get(b.break_type_id)
          : null;
        return breakType?.description;
      }) && (
        <div className="space-y-1 border-border/20 border-t pt-2">
          {breaks.map((breakRecord) => {
            const breakType = breakRecord.break_type_id
              ? (breakTypesById.get(breakRecord.break_type_id) ?? null)
              : null;
            return breakType?.description ? (
              <p
                key={`${breakRecord.id}-notes`}
                className="px-1 text-muted-foreground text-xs italic"
              >
                <span className="font-medium">
                  {breakType?.name ||
                    breakRecord.break_type_name ||
                    t('unnamed_break')}
                  :
                </span>{' '}
                {breakType.description}
              </p>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Type for break summary data
 */
export interface BreakSummaryData {
  break_duration_seconds: number;
}

/**
 * Hook to fetch breaks summary for multiple sessions at once
 * Prevents N+1 query issues by batching all session IDs
 */
export function useSessionBreaksSummary(sessionIds: string[]) {
  const params = useParams<{ wsId: string | string[] }>();
  const wsId = Array.isArray(params.wsId) ? params.wsId[0] : params.wsId;

  return useQuery({
    queryKey: ['session-breaks-batch', sessionIds.sort().join(',')],
    queryFn: async () => {
      if (sessionIds.length === 0 || !wsId) return {};
      return listSessionBreakSummaries(wsId, sessionIds);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - same as other break queries
    enabled: sessionIds.length > 0 && Boolean(wsId),
  });
}

/**
 * Inline break duration display for session lists
 * Shows total break time as a compact badge
 */
interface BreakSummaryProps {
  sessionId: string;
  compact?: boolean;
  /** Optional: Pre-fetched break data. When provided, component becomes presentational */
  breaks?: BreakSummaryData[];
}

export function BreakSummary({
  sessionId,
  compact = false,
  breaks: prefetchedBreaks,
}: BreakSummaryProps) {
  const t = useTranslations('time-tracker.breaks');
  const params = useParams<{ wsId: string | string[] }>();
  const wsId = Array.isArray(params.wsId) ? params.wsId[0] : params.wsId;

  // Only fetch if breaks weren't provided
  const { data: fetchedBreaks } = useQuery({
    queryKey: ['session-breaks-summary', sessionId],
    queryFn: async () => {
      if (!wsId) return [];
      const breaksBySession = await listSessionBreakSummaries(wsId, [
        sessionId,
      ]);
      return breaksBySession[sessionId] ?? [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !prefetchedBreaks && Boolean(wsId), // Skip query if data already provided
  });

  // Use prefetched data if available, otherwise use fetched data
  const breaks = prefetchedBreaks ?? fetchedBreaks;

  if (!breaks || breaks.length === 0) {
    return null;
  }

  const totalBreakDuration = breaks.reduce(
    (sum, b) => sum + (b.break_duration_seconds || 0),
    0
  );

  if (totalBreakDuration === 0) {
    return null;
  }

  const displayText = compact
    ? formatBreakDuration(totalBreakDuration)
    : `${t('total')}: ${formatBreakDuration(totalBreakDuration)}`;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground text-xs">
      <Icons.Pause className="h-3 w-3" />
      {displayText}
    </span>
  );
}

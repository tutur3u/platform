'use client';

import { useQuery } from '@tanstack/react-query';
import * as Icons from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useTranslations } from 'next-intl';

interface BreakDisplayProps {
  sessionId: string;
}

/**
 * Map break type color to dynamic color token
 */
const getBreakTypeColor = (
  colorName: string | null | undefined
): string => {
  if (!colorName) return 'dynamic-blue';
  
  const colorMap: Record<string, string> = {
    RED: 'dynamic-red',
    BLUE: 'dynamic-blue',
    GREEN: 'dynamic-green',
    YELLOW: 'dynamic-yellow',
    ORANGE: 'dynamic-orange',
    PURPLE: 'dynamic-purple',
    PINK: 'dynamic-pink',
    INDIGO: 'dynamic-indigo',
    CYAN: 'dynamic-cyan',
    GRAY: 'dynamic-surface',
  };

  return colorMap[colorName.toUpperCase()] || 'dynamic-blue';
};

/**
 * Get icon component by name
 */
const getIconComponent = (iconName: string | null | undefined) => {
  if (!iconName) return Icons.Coffee;
  
  const iconKey = iconName.charAt(0).toUpperCase() + iconName.slice(1);
  const IconComponent = (Icons as Record<string, any>)[iconKey];
  
  return IconComponent || Icons.Coffee;
};

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
 * Format time to HH:MM format
 */
export const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Break Display Component - Shows breaks within a session
 * Displays break type, duration, and time information
 */
export function BreakDisplay({ sessionId }: BreakDisplayProps) {
  const t = useTranslations('time-tracker.breaks');
  const supabase = createClient();

  const { data: breaks, isLoading } = useQuery({
    queryKey: ['session-breaks', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_tracking_breaks')
        .select('*, break_type_id:workspace_break_types(*)')
        .eq('session_id', sessionId)
        .order('break_start', { ascending: false });

      if (error) {
        console.error('Error fetching breaks:', error);
        return [];
      }

      return (data || []);
    },
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
          const breakType = (breakRecord.break_type_id as any);
          const breakTypeColor = getBreakTypeColor(breakType?.color);
          const BreakIcon = getIconComponent(breakType?.icon);
          const borderClass = `border-${breakTypeColor}/20`;
          const bgClass = `bg-${breakTypeColor}/5`;
          const textClass = `text-${breakTypeColor}`;
          const badgeBgClass = `bg-${breakTypeColor}/30`;

          return (
            <div
              key={breakRecord.id}
              className={`flex items-center justify-between gap-2 rounded-md border ${borderClass} ${bgClass} px-2.5 py-2`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <BreakIcon className={`h-3.5 w-3.5 shrink-0 ${textClass}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate font-semibold ${textClass} text-xs`}>
                      {breakType?.name || breakRecord.break_type_name || t('unnamed_break')}
                    </span>
                    {!breakRecord.break_end && (
                      <span className={`inline-block shrink-0 rounded-full ${badgeBgClass} px-1.5 py-0.5 ${textClass} text-xs font-medium`}>
                        {t('active')}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs ${textClass}/75`}>
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
              <div className={`shrink-0 font-mono font-semibold ${textClass} text-xs`}>
                {breakRecord.break_duration_seconds
                  ? formatBreakDuration(breakRecord.break_duration_seconds)
                  : t('ongoing')}
              </div>
            </div>
          );
        })}
      </div>
      {breaks.some((b) => {
        const breakType = (b.break_type_id as any);
        return breakType?.notes;
      }) && (
        <div className="space-y-1 border-t border-border/20 pt-2">
          {breaks.map((breakRecord) => {
            const breakType = (breakRecord.break_type_id as any);
            return breakType?.notes ? (
              <p
                key={`${breakRecord.id}-notes`}
                className="px-1 text-xs italic text-muted-foreground"
              >
                <span className="font-medium">
                  {breakType?.name || breakRecord.break_type_name || t('unnamed_break')}:
                </span>{' '}
                {breakType.notes}
              </p>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Inline break duration display for session lists
 * Shows total break time as a compact badge
 */
interface BreakSummaryProps {
  sessionId: string;
  compact?: boolean;
}

export function BreakSummary({ sessionId, compact = false }: BreakSummaryProps) {
  const t = useTranslations('time-tracker.breaks');
  const supabase = createClient();

  const { data: breaks } = useQuery({
    queryKey: ['session-breaks-summary', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_tracking_breaks')
        .select('break_duration_seconds')
        .eq('session_id', sessionId)
        .not('break_duration_seconds', 'is', null);

      if (error) return [];
      return (data || []) as Array<{ break_duration_seconds: number }>;
    },
  });

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
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Icons.Pause className="h-3 w-3" />
      {displayText}
    </span>
  );
}

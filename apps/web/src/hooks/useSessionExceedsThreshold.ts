import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { SessionWithRelations } from '@/app/[locale]/(dashboard)/[wsId]/time-tracker/types';

/**
 * Hook to determine if a running session has exceeded the workspace threshold.
 *
 * This is used to detect when a user has a session running for longer than
 * the allowed threshold (e.g., forgot to stop it days ago), and they need
 * to either discard it or create a proper missed entry request.
 *
 * @param session - The current running session
 * @param thresholdDays - The workspace threshold setting (null = no limit, 0 = all require approval, >0 = days limit)
 * @param isLoading - Whether the threshold is still loading
 * @returns Object with exceeds status and threshold info
 */

const DEFAULT_RUNNING_SESSION_LIMIT_HOURS = 24;

interface SessionThresholdResult {
  exceeds: boolean;
  thresholdDays: number | null;
  isLoading: boolean;
  sessionStartTime: dayjs.Dayjs | null;
  sessionDuration: number; // in seconds
}

export function useSessionExceedsThreshold(
  session: SessionWithRelations | null,
  thresholdDays: number | null | undefined,
  isLoading: boolean = false
): SessionThresholdResult {
  return useMemo(() => {
    // If no session or session is not running, it doesn't exceed
    if (!session || !session.is_running || !session.start_time) {
      return {
        exceeds: false,
        thresholdDays: thresholdDays ?? null,
        isLoading,
        sessionStartTime: null,
        sessionDuration: 0,
      };
    }

    const sessionStartTime = dayjs(session.start_time);
    const now = dayjs();
    const sessionDuration = now.diff(sessionStartTime, 'second');

    // If threshold is still loading, return a "pending" state
    // Don't mark as exceeding while loading to avoid flicker
    if (isLoading || thresholdDays === undefined) {
      return {
        exceeds: false,
        thresholdDays: null,
        isLoading: true,
        sessionStartTime,
        sessionDuration,
      };
    }

    // If threshold is null, no restrictions apply - session can run indefinitely
    if (thresholdDays === null) {
      return {
        exceeds: false,
        thresholdDays: null,
        isLoading: false,
        sessionStartTime,
        sessionDuration,
      };
    }

    // If threshold is 0, all entries require approval
    // A running session exceeds if it's been running for more than a reasonable time (e.g., 24 hours)
    // This prevents the UI from showing the dialog immediately when threshold is 0
    if (thresholdDays === 0) {
      const exceeds =
        sessionDuration > DEFAULT_RUNNING_SESSION_LIMIT_HOURS * 60 * 60; // More than 24 hours
      return {
        exceeds,
        thresholdDays: 0,
        isLoading: false,
        sessionStartTime,
        sessionDuration,
      };
    }

    // Check if session started more than threshold days ago
    const thresholdAgo = now.subtract(thresholdDays, 'day');
    const exceeds = sessionStartTime.isBefore(thresholdAgo);

    return {
      exceeds,
      thresholdDays,
      isLoading: false,
      sessionStartTime,
      sessionDuration,
    };
  }, [session, thresholdDays, isLoading]);
}

/**
 * Utility function to check if a session start time exceeds the threshold.
 * This can be used outside of React components.
 *
 * @param sessionStartTime - The session start time as a Date or ISO string
 * @param thresholdDays - The workspace threshold setting
 * @returns true if the session exceeds the threshold
 */
export function sessionExceedsThreshold(
  sessionStartTime: Date | string,
  thresholdDays: number | null
): boolean {
  if (thresholdDays === null) return false;

  const start = dayjs(sessionStartTime);
  const now = dayjs();

  if (thresholdDays === 0) {
    // For threshold 0, check if running more than 24 hours
    return (
      now.diff(start, 'second') > DEFAULT_RUNNING_SESSION_LIMIT_HOURS * 60 * 60
    );
  }

  const thresholdAgo = now.subtract(thresholdDays, 'day');
  return start.isBefore(thresholdAgo);
}

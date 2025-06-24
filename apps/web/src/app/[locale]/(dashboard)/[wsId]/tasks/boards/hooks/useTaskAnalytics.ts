import { useMemo } from 'react';
import { getTaskCompletionDate } from '../utils/taskHelpers';

interface Task {
  id: string;
  name: string;
  description?: string;
  priority?: number | null;
  created_at?: string;
  updated_at?: string;
  end_date?: string | null;
  boardId: string;
  boardName: string;
  listName: string;
  listStatus?: string;
  archived?: boolean;
}

interface DurationResult {
  days: number;
  hours: number;
  label: string;
  count: number;
  description: string;
}

interface VelocityResult {
  thisWeek: number;
  lastWeek: number;
  avgPerWeek: number;
  last4Weeks: number;
  trend: number;
  label: string;
  description: string;
}

interface OnTimeRateResult {
  rate: number;
  onTime: number;
  total: number;
  late: number;
  label: string;
  description: string;
}

/**
 * Hook to calculate average task completion time
 */
export function useAvgDuration(
  allTasks: Task[],
  selectedBoard: string | null
): DurationResult {
  return useMemo(() => {
    const filteredTasks = selectedBoard
      ? allTasks.filter((task) => task.boardId === selectedBoard)
      : allTasks;

    // Get completed tasks with proper date fields
    const completedTasks = filteredTasks.filter((task) => {
      const isCompleted =
        task.listStatus === 'done' ||
        task.listStatus === 'closed' ||
        task.archived;

      // Check for creation and completion dates using safe accessors
      const hasCreatedAt = task.created_at;
      const completionDate = getTaskCompletionDate(task);

      return isCompleted && hasCreatedAt && completionDate;
    });

    if (completedTasks.length === 0) {
      return {
        days: 0,
        hours: 0,
        label: 'N/A',
        count: 0,
        description: 'No completed tasks with valid dates',
      };
    }

    let validDurations = 0;
    const totalDurationMs = completedTasks.reduce((sum, task) => {
      const createdDate = new Date(task.created_at!);
      const completionDate = getTaskCompletionDate(task);

      // Validate dates
      if (
        !completionDate ||
        Number.isNaN(createdDate.getTime()) ||
        Number.isNaN(completionDate.getTime())
      ) {
        return sum;
      }

      const duration = completionDate.getTime() - createdDate.getTime();

      // Only include positive durations (completed after creation) and reasonable durations (less than 1 year)
      const maxReasonableDuration = 365 * 24 * 60 * 60 * 1000; // 1 year in ms
      if (duration > 0 && duration < maxReasonableDuration) {
        validDurations++;
        return sum + duration;
      }
      return sum;
    }, 0);

    if (validDurations === 0) {
      return {
        days: 0,
        hours: 0,
        label: 'N/A',
        count: completedTasks.length,
        description:
          completedTasks.length > 0
            ? `${completedTasks.length} completed tasks but no valid completion dates`
            : 'No completed tasks with valid dates',
      };
    }

    const avgDurationMs = totalDurationMs / validDurations;
    const avgDays = Math.floor(avgDurationMs / (1000 * 60 * 60 * 24));
    const avgHours = Math.floor(avgDurationMs / (1000 * 60 * 60));

    // Return appropriate format based on duration
    if (avgDays >= 1) {
      const remainingHours = Math.floor(
        (avgDurationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      return {
        days: avgDays,
        hours: remainingHours,
        label:
          remainingHours > 0 ? `${avgDays}d ${remainingHours}h` : `${avgDays}d`,
        count: validDurations,
        description: `Based on ${validDurations} completed tasks`,
      };
    } else if (avgHours >= 1) {
      return {
        days: 0,
        hours: avgHours,
        label: `${avgHours}h`,
        count: validDurations,
        description: `Based on ${validDurations} completed tasks`,
      };
    } else {
      const avgMinutes = Math.floor(avgDurationMs / (1000 * 60));
      return {
        days: 0,
        hours: 0,
        label: avgMinutes > 0 ? `${avgMinutes}m` : '<1m',
        count: validDurations,
        description: `Based on ${validDurations} completed tasks`,
      };
    }
  }, [allTasks, selectedBoard]);
}

/**
 * Hook to calculate task velocity (tasks completed per week)
 */
export function useTaskVelocity(
  allTasks: Task[],
  selectedBoard: string | null
): VelocityResult {
  return useMemo(() => {
    const filteredTasks = selectedBoard
      ? allTasks.filter((task) => task.boardId === selectedBoard)
      : allTasks;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Filter completed tasks with valid completion dates
    const completedTasks = filteredTasks.filter((task) => {
      const isCompleted =
        task.listStatus === 'done' ||
        task.listStatus === 'closed' ||
        task.archived;
      const completionDate = getTaskCompletionDate(task);
      return (
        isCompleted && completionDate && !Number.isNaN(completionDate.getTime())
      );
    });

    const thisWeekCompleted = completedTasks.filter((task) => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= oneWeekAgo;
    }).length;

    const lastWeekCompleted = completedTasks.filter((task) => {
      const completionDate = getTaskCompletionDate(task);
      return (
        completionDate &&
        completionDate >= twoWeeksAgo &&
        completionDate < oneWeekAgo
      );
    }).length;

    // Calculate trend
    const trend =
      lastWeekCompleted > 0
        ? ((thisWeekCompleted - lastWeekCompleted) / lastWeekCompleted) * 100
        : thisWeekCompleted > 0
          ? 100
          : 0;

    // Calculate average over 4 weeks for more stable metric
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const last4WeeksCompleted = completedTasks.filter((task) => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= fourWeeksAgo;
    }).length;

    const avgPerWeek =
      last4WeeksCompleted > 0 ? Math.round(last4WeeksCompleted / 4) : 0;

    // Create descriptive text with trend indicator
    const trendIndicator = trend > 0 ? '↗️' : trend < 0 ? '↘️' : '→';
    const trendText =
      trend !== 0 ? ` (${trendIndicator} ${Math.abs(Math.round(trend))}%)` : '';

    // Determine best label to show
    let label = '0/week';
    if (thisWeekCompleted > 0) {
      label = `${thisWeekCompleted}/week`;
    } else if (avgPerWeek > 0) {
      label = `~${avgPerWeek}/week`;
    }

    return {
      thisWeek: thisWeekCompleted,
      lastWeek: lastWeekCompleted,
      avgPerWeek,
      last4Weeks: last4WeeksCompleted,
      trend: Math.round(trend),
      label,
      description:
        completedTasks.length > 0
          ? `This week: ${thisWeekCompleted}, Last week: ${lastWeekCompleted}${trendText}`
          : 'No completed tasks yet',
    };
  }, [allTasks, selectedBoard]);
}

/**
 * Hook to calculate on-time delivery rate
 */
export function useOnTimeRate(
  allTasks: Task[],
  selectedBoard: string | null
): OnTimeRateResult {
  return useMemo(() => {
    const filteredTasks = selectedBoard
      ? allTasks.filter((task) => task.boardId === selectedBoard)
      : allTasks;

    // Get completed tasks that have both due dates and completion dates
    const completedWithDueDate = filteredTasks.filter((task) => {
      const isCompleted =
        task.listStatus === 'done' ||
        task.listStatus === 'closed' ||
        task.archived;
      const hasDueDate = task.end_date;
      const completionDate = getTaskCompletionDate(task);

      return (
        isCompleted &&
        hasDueDate &&
        completionDate &&
        !Number.isNaN(completionDate.getTime())
      );
    });

    if (completedWithDueDate.length === 0) {
      const totalCompleted = filteredTasks.filter(
        (task) =>
          task.listStatus === 'done' ||
          task.listStatus === 'closed' ||
          task.archived
      ).length;

      return {
        rate: 0,
        onTime: 0,
        total: 0,
        late: 0,
        label: 'N/A',
        description:
          totalCompleted > 0
            ? `${totalCompleted} completed tasks but no due dates set`
            : 'No completed tasks with due dates yet',
      };
    }

    // Count tasks completed on or before their due date
    const onTimeCompleted = completedWithDueDate.filter((task) => {
      const completionDate = getTaskCompletionDate(task);
      const dueDate = new Date(task.end_date!);

      // Validate both dates
      if (
        !completionDate ||
        Number.isNaN(completionDate.getTime()) ||
        Number.isNaN(dueDate.getTime())
      ) {
        return false;
      }

      // Consider on-time if completed on or before due date (with some tolerance for same day)
      const timeDiff = completionDate.getTime() - dueDate.getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;

      return timeDiff <= oneDayMs; // Allow up to 1 day late to be considered "on time"
    }).length;

    const rate =
      completedWithDueDate.length > 0
        ? Math.round((onTimeCompleted / completedWithDueDate.length) * 100)
        : 0;
    const lateCount = completedWithDueDate.length - onTimeCompleted;

    return {
      rate,
      onTime: onTimeCompleted,
      total: completedWithDueDate.length,
      late: lateCount,
      label: `${rate}%`,
      description: `${onTimeCompleted} on time, ${lateCount} late (of ${completedWithDueDate.length} with due dates)`,
    };
  }, [allTasks, selectedBoard]);
}

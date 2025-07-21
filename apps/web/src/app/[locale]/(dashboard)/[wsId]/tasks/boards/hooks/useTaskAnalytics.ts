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

// Cache for expensive date calculations
const dateCache = new Map<string, Date>();

// Helper function to get cached date
const getCachedDate = (dateString: string): Date => {
  if (!dateCache.has(dateString)) {
    dateCache.set(dateString, new Date(dateString));
  }
  const cached = dateCache.get(dateString);
  if (!cached) {
    throw new Error('Failed to get cached date');
  }
  return cached;
};

// Helper function to clear cache when needed
const clearDateCache = () => {
  dateCache.clear();
};

/**
 * Hook to calculate average task completion time - Optimized
 */
export function useAvgDuration(
  allTasks: Task[],
  selectedBoard: string | null
): DurationResult {
  return useMemo(() => {
    // Early return for empty tasks
    if (!allTasks.length) {
      return {
        days: 0,
        hours: 0,
        label: 'N/A',
        count: 0,
        description: 'No tasks available',
      };
    }

    const filteredTasks = selectedBoard
      ? allTasks.filter((task) => task.boardId === selectedBoard)
      : allTasks;

    // Get completed tasks with proper date fields - optimized filtering
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
      try {
        if (!task.created_at) return sum;
        const createdDate = getCachedDate(task.created_at);
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
      } catch {
        // Skip invalid dates
        return sum;
      }
      return sum;
    }, 0);

    if (validDurations === 0) {
      return {
        days: 0,
        hours: 0,
        label: 'N/A',
        count: 0,
        description: 'No valid task durations found',
      };
    }

    const avgDurationMs = totalDurationMs / validDurations;
    const days = Math.floor(avgDurationMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (avgDurationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );

    let label: string;
    if (days >= 1) {
      label = `${days}d ${hours}h`;
    } else if (hours >= 1) {
      label = `${hours}h`;
    } else {
      label = '<1h';
    }

    return {
      days,
      hours,
      label,
      count: validDurations,
      description: `Average completion time based on ${validDurations} tasks`,
    };
  }, [allTasks, selectedBoard]);
}

/**
 * Hook to calculate task velocity - Optimized
 */
export function useTaskVelocity(
  allTasks: Task[],
  selectedBoard: string | null
): VelocityResult {
  return useMemo(() => {
    // Early return for empty tasks
    if (!allTasks.length) {
      return {
        thisWeek: 0,
        lastWeek: 0,
        avgPerWeek: 0,
        last4Weeks: 0,
        trend: 0,
        label: 'N/A',
        description: 'No tasks available',
      };
    }

    const filteredTasks = selectedBoard
      ? allTasks.filter((task) => task.boardId === selectedBoard)
      : allTasks;

    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);

    const last4WeeksStart = new Date(thisWeekStart);
    last4WeeksStart.setDate(thisWeekStart.getDate() - 28);

    // Count completed tasks in different time periods
    const thisWeekCompleted = filteredTasks.filter((task) => {
      const completionDate = getTaskCompletionDate(task);
      return (
        completionDate &&
        completionDate >= thisWeekStart &&
        completionDate < now
      );
    }).length;

    const lastWeekCompleted = filteredTasks.filter((task) => {
      const completionDate = getTaskCompletionDate(task);
      return (
        completionDate &&
        completionDate >= lastWeekStart &&
        completionDate < thisWeekStart
      );
    }).length;

    const last4WeeksCompleted = filteredTasks.filter((task) => {
      const completionDate = getTaskCompletionDate(task);
      return (
        completionDate &&
        completionDate >= last4WeeksStart &&
        completionDate < now
      );
    }).length;

    const avgPerWeek = last4WeeksCompleted / 4;
    const trend = thisWeekCompleted - lastWeekCompleted;

    let label: string;
    if (thisWeekCompleted > lastWeekCompleted) {
      label = `+${thisWeekCompleted - lastWeekCompleted}`;
    } else if (thisWeekCompleted < lastWeekCompleted) {
      label = `${thisWeekCompleted - lastWeekCompleted}`;
    } else {
      label = '0';
    }

    return {
      thisWeek: thisWeekCompleted,
      lastWeek: lastWeekCompleted,
      avgPerWeek: Math.round(avgPerWeek * 10) / 10,
      last4Weeks: last4WeeksCompleted,
      trend,
      label,
      description: `Completed ${thisWeekCompleted} tasks this week vs ${lastWeekCompleted} last week`,
    };
  }, [allTasks, selectedBoard]);
}

/**
 * Hook to calculate on-time completion rate - Optimized
 */
export function useOnTimeRate(
  allTasks: Task[],
  selectedBoard: string | null
): OnTimeRateResult {
  return useMemo(() => {
    // Early return for empty tasks
    if (!allTasks.length) {
      return {
        rate: 0,
        onTime: 0,
        total: 0,
        late: 0,
        label: 'N/A',
        description: 'No tasks available',
      };
    }

    const filteredTasks = selectedBoard
      ? allTasks.filter((task) => task.boardId === selectedBoard)
      : allTasks;

    // Get completed tasks with due dates
    const completedTasks = filteredTasks.filter((task) => {
      const isCompleted =
        task.listStatus === 'done' ||
        task.listStatus === 'closed' ||
        task.archived;

      return isCompleted && task.end_date;
    });

    if (completedTasks.length === 0) {
      return {
        rate: 0,
        onTime: 0,
        total: 0,
        late: 0,
        label: 'N/A',
        description: 'No completed tasks with due dates',
      };
    }

    let onTime = 0;
    let late = 0;

    completedTasks.forEach((task) => {
      try {
        if (!task.end_date) return;
        const dueDate = getCachedDate(task.end_date);
        const completionDate = getTaskCompletionDate(task);

        if (
          completionDate &&
          !Number.isNaN(dueDate.getTime()) &&
          !Number.isNaN(completionDate.getTime())
        ) {
          if (completionDate <= dueDate) {
            onTime++;
          } else {
            late++;
          }
        }
      } catch {
        // Skip invalid dates
      }
    });

    const total = onTime + late;
    const rate = total > 0 ? (onTime / total) * 100 : 0;

    return {
      rate: Math.round(rate * 10) / 10,
      onTime,
      total,
      late,
      label: `${Math.round(rate)}%`,
      description: `${onTime} on time, ${late} late out of ${total} tasks`,
    };
  }, [allTasks, selectedBoard]);
}

// Export cache clearing function for cleanup
export { clearDateCache };

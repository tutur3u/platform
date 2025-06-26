'use client';

import { Card } from '@tuturuuu/ui/card';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTaskCompletionDate } from '../utils/taskHelpers';
import { GanttControls } from './GanttControls';
import { GanttHeader } from './GanttHeader';
import { GanttTimeline } from './GanttTimeline';
import { TaskDetailCard } from './TaskDetailCard';

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed';
}

interface Task {
  id: string;
  name: string;
  status?: string;
  boardId: string;
  listStatus?: string;
  archived?: boolean;
  created_at: string;
  updated_at?: string;
  end_date?: string;
  priority?: number | null | undefined;
  assignee_name?: string;
  description?: string;
  boardName: string;
  listName: string;
  // Add other relevant fields as needed
}

interface TimelineTask extends Task {
  startOffset: number;
  width: number;
  endDate: string;
  createdDate: string;
}

interface GanttChartProps {
  allTasks: Task[];
  filters: AnalyticsFilters;
}

export function GanttChart({ allTasks, filters }: GanttChartProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [searchQuery, setSearchQuery] = useState('');
  const [clickCardVisible, setClickCardVisible] = useState(false);
  const [clickCardPosition, setClickCardPosition] = useState({ x: 0, y: 0 });
  const [clickedTask, setClickedTask] = useState<Task | null>(null);

  // Filter tasks based on selected board, status, and search
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;

    // Filter by board
    if (filters.selectedBoard) {
      tasks = tasks.filter((task) => task.boardId === filters.selectedBoard);
    }

    // Filter by status
    if (filters.statusFilter !== 'all') {
      tasks = tasks.filter((task) => {
        const taskStatus = task.listStatus || 'not_started';
        return taskStatus === filters.statusFilter;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.name?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.boardName?.toLowerCase().includes(query)
      );
    }

    return tasks;
  }, [allTasks, filters.selectedBoard, filters.statusFilter, searchQuery]);

  // Get time range based on filter
  const getTimeRange = () => {
    const now = new Date();
    switch (filters.timeView) {
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return { start: weekStart, end: weekEnd };
      }
      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: monthStart, end: monthEnd };
      }
      case 'year': {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        return { start: yearStart, end: yearEnd };
      }
    }
  };

  const timeRange = getTimeRange();
  const totalDays = Math.ceil(
    (timeRange.end.getTime() - timeRange.start.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  // Calculate productivity stats
  const productivityStats = useMemo(() => {
    const completed = filteredTasks.filter(
      (task) => task.listStatus === 'done' || task.listStatus === 'closed'
    ).length;
    const total = filteredTasks.length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const overdue = filteredTasks.filter(
      (task) =>
        task.end_date &&
        new Date(task.end_date) < new Date() &&
        task.listStatus !== 'done' &&
        task.listStatus !== 'closed'
    ).length;

    const onTime = completed - overdue;
    const onTimeRate = completed > 0 ? (onTime / completed) * 100 : 0;

    return {
      completionRate: completionRate.toFixed(1),
      onTimeRate: onTimeRate.toFixed(1),
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue,
    };
  }, [filteredTasks]);

  // Process all tasks for Gantt display (before pagination)
  const allGanttTasks = useMemo(() => {
    return filteredTasks
      .filter((task) => task.created_at) // Only tasks with creation date
      .map((task) => {
        const createdDate = new Date(task.created_at);
        const endDate =
          task.listStatus === 'done' || task.listStatus === 'closed'
            ? task.updated_at
              ? new Date(task.updated_at)
              : createdDate
            : task.end_date
              ? new Date(task.end_date)
              : new Date();

        // Calculate position and width
        const startOffset = Math.max(
          0,
          (createdDate.getTime() - timeRange.start.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const duration = Math.max(
          1,
          (endDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const timelineTask: TimelineTask = {
          ...task,
          createdDate:
            typeof task.created_at === 'string'
              ? task.created_at
              : new Date(task.created_at).toISOString(),
          endDate:
            typeof task.end_date === 'string'
              ? task.end_date
              : task.end_date
                ? new Date(task.end_date).toISOString()
                : '',
          startOffset: (startOffset / totalDays) * 100,
          width: Math.min(
            (duration / totalDays) * 100,
            100 - (startOffset / totalDays) * 100
          ),
          status: task.listStatus || 'not_started',
        };

        return timelineTask;
      })
      .filter((task) => task.startOffset < 100) // Only show tasks within time range
      .sort((a, b) => a.createdDate.getTime() - b.createdDate.getTime());
  }, [filteredTasks, timeRange, totalDays]);

  // Calculate pagination
  const totalTasks = allGanttTasks.length;
  const totalPages = Math.ceil(totalTasks / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Generate time markers - Move this before useEffect
  const timeMarkers = useMemo(() => {
    const markers = [];
    const markerCount =
      filters.timeView === 'week' ? 7 : filters.timeView === 'month' ? 4 : 12;

    for (let i = 0; i <= markerCount; i++) {
      const position = (i / markerCount) * 100;
      const date = new Date(timeRange.start);

      if (filters.timeView === 'week') {
        date.setDate(date.getDate() + i);
        markers.push({
          position,
          label: date.toLocaleDateString('en', { weekday: 'short' }),
        });
      } else if (filters.timeView === 'month') {
        date.setDate(date.getDate() + i * 7);
        markers.push({ position, label: `Week ${i + 1}` });
      } else {
        date.setMonth(date.getMonth() + i);
        markers.push({
          position,
          label: date.toLocaleDateString('en', { month: 'short' }),
        });
      }
    }
    return markers;
  }, [filters.timeView, timeRange]);

  // Get current page tasks
  const ganttTasks = useMemo(() => {
    return allGanttTasks.slice(startIndex, endIndex);
  }, [allGanttTasks, startIndex, endIndex]);

  // Calculate task duration for the clicked task - moved to top level to avoid hook order issues
  const clickedTaskDuration = useMemo(() => {
    if (!clickedTask) return 'N/A';

    try {
      const createdDate = clickedTask.created_at
        ? new Date(clickedTask.created_at)
        : null;

      if (!createdDate || Number.isNaN(createdDate.getTime())) {
        return 'N/A';
      }

      // For completed tasks, calculate actual duration
      if (clickedTask.status === 'done' || clickedTask.status === 'closed') {
        const completionDate = getTaskCompletionDate(clickedTask);
        if (completionDate && !Number.isNaN(completionDate.getTime())) {
          const durationMs = completionDate.getTime() - createdDate.getTime();
          const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor(durationMs / (1000 * 60 * 60));

          if (days >= 1) {
            return `${days} day${days !== 1 ? 's' : ''}`;
          } else if (hours >= 1) {
            return `${hours} hr${hours !== 1 ? 's' : ''}`;
          } else {
            return '<1 hr';
          }
        }
      }

      // For non-completed tasks, show planned duration or time elapsed
      if (clickedTask.end_date) {
        const dueDate = new Date(clickedTask.end_date);
        if (!Number.isNaN(dueDate.getTime())) {
          const plannedDurationMs = dueDate.getTime() - createdDate.getTime();
          const days = Math.floor(plannedDurationMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor(plannedDurationMs / (1000 * 60 * 60));

          if (days >= 1) {
            return `${days} day${days !== 1 ? 's' : ''} (planned)`;
          } else if (hours >= 1) {
            return `${hours} hr${hours !== 1 ? 's' : ''} (planned)`;
          } else {
            return '<1 hr (planned)';
          }
        }
      }

      // Fallback: show time elapsed since creation
      const now = new Date();
      const elapsedMs = now.getTime() - createdDate.getTime();
      const days = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor(elapsedMs / (1000 * 60 * 60));

      if (days >= 1) {
        return `${days} day${days !== 1 ? 's' : ''} (elapsed)`;
      } else if (hours >= 1) {
        return `${hours} hr${hours !== 1 ? 's' : ''} (elapsed)`;
      } else {
        return '<1 hr (elapsed)';
      }
    } catch {
      return 'N/A';
    }
  }, [clickedTask]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, []);

  // Add the click handlers to the GanttChart component
  const handleTaskClick = (e: React.MouseEvent, task: TimelineTask) => {
    e.stopPropagation();

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    setClickedTask(task);
    setClickCardVisible(true);

    // Position near the click
    let newX = mouseX + 15;
    let newY = mouseY + 15;

    // Ensure it doesn't go off screen
    if (newX + 250 > window.innerWidth) {
      newX = mouseX - 265;
    }
    if (newY + 150 > window.innerHeight) {
      newY = mouseY - 165;
    }

    setClickCardPosition({ x: newX, y: newY });
  };

  const handleCloseClick = useCallback(() => {
    setClickedTask(null);
    setClickCardVisible(false);
  }, []);

  // Add click outside to close
  useEffect(() => {
    const handleScroll = () => {
      handleCloseClick();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseClick();
      }
    };

    if (clickCardVisible) {
      document.addEventListener('scroll', handleScroll, true); // Use capture to catch all scroll events
      document.addEventListener('keydown', handleEscape);
      window.addEventListener('scroll', handleScroll);
      // Also listen for scrolling on the gantt container
      const ganttContainer = document.querySelector('.custom-scrollbar');
      if (ganttContainer) {
        ganttContainer.addEventListener('scroll', handleScroll);
      }
    }

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll);
      const ganttContainer = document.querySelector('.custom-scrollbar');
      if (ganttContainer) {
        ganttContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [clickCardVisible, handleCloseClick]);

  return (
    <>
      <Card className="p-6">
        <GanttHeader productivityStats={productivityStats} />

        <GanttControls
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          pageSize={pageSize}
          setPageSize={setPageSize}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          totalTasks={totalTasks}
          totalPages={totalPages}
          startIndex={startIndex}
          endIndex={endIndex}
        />

        <GanttTimeline
          filters={filters}
          timeMarkers={timeMarkers}
          ganttTasks={ganttTasks}
          handleTaskClick={handleTaskClick}
        />
      </Card>

      <TaskDetailCard
        clickCardVisible={clickCardVisible}
        clickedTask={clickedTask}
        clickCardPosition={clickCardPosition}
        clickedTaskDuration={clickedTaskDuration}
        handleCloseClick={handleCloseClick}
      />
    </>
  );
}

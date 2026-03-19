import { describe, expect, it } from 'vitest';
import {
  buildHabitPrerequisiteMap,
  topologicallySortHabits,
} from '../habit-dependencies';
import { generatePreview } from './preview-engine';

// Define minimal types for testing (matching the internal types)
interface CalendarEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  locked?: boolean;
  _isPreview?: boolean;
}

type CalendarHoursType = 'work_hours' | 'personal_hours' | 'meeting_hours';

type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

type TimeOfDayPreference = 'morning' | 'afternoon' | 'evening' | 'night';
type HabitFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  duration_minutes: number;
  min_duration_minutes?: number | null;
  max_duration_minutes?: number | null;
  is_splittable?: boolean | null;
  min_instances_per_day?: number | null;
  ideal_instances_per_day?: number | null;
  max_instances_per_day?: number | null;
  dependency_habit_id?: string | null;
  dependency_type?: 'after' | 'before' | null;
  calendar_hours: CalendarHoursType;
  priority: TaskPriority;
  auto_schedule: boolean;
  is_visible_in_calendar: boolean;
  is_active: boolean;
  ideal_time?: string;
  ws_id: string;
  color: string;
  recurrence_interval: number;
  start_date: string;
  end_date?: string | null;
  time_preference?: TimeOfDayPreference;
  created_at: string;
  updated_at: string;
}

// Mock minimal hour settings for tests - use null for optional fields
const emptyDay = {
  enabled: true,
  timeBlocks: [{ startTime: '00:00', endTime: '23:59' }],
};
const validMockWeek = {
  sunday: emptyDay,
  monday: emptyDay,
  tuesday: emptyDay,
  wednesday: emptyDay,
  thursday: emptyDay,
  friday: emptyDay,
  saturday: emptyDay,
};

const mockHourSettings = {
  workHours: validMockWeek,
  personalHours: validMockWeek,
  meetingHours: validMockWeek,
} as any;

const focusedWorkWeek = {
  sunday: { enabled: false, timeBlocks: [] },
  monday: {
    enabled: true,
    timeBlocks: [
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ],
  },
  tuesday: {
    enabled: true,
    timeBlocks: [
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ],
  },
  wednesday: {
    enabled: true,
    timeBlocks: [
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ],
  },
  thursday: {
    enabled: true,
    timeBlocks: [
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ],
  },
  friday: {
    enabled: true,
    timeBlocks: [
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ],
  },
  saturday: { enabled: false, timeBlocks: [] },
};

const focusedHourSettings = {
  workHours: focusedWorkWeek,
  personalHours: focusedWorkWeek,
  meetingHours: focusedWorkWeek,
} as any;

describe('generatePreview', () => {
  const now = new Date('2025-12-14T12:00:00Z');

  describe('blocked events logic', () => {
    it('should block locked events', () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'locked-event-1',
          title: 'Locked Meeting',
          start_at: '2025-12-14T14:00:00Z',
          end_at: '2025-12-14T15:00:00Z',
          locked: true,
        },
      ];

      const result = generatePreview([], [], existingEvents, mockHourSettings, {
        windowDays: 7,
        now,
      });

      // The locked event should be in blocked events
      expect(result.steps[0]?.debug?.slotsAvailable).toBeGreaterThan(0);
    });

    it('should block past/in-progress events', () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'past-event-1',
          title: 'Past Event',
          start_at: '2025-12-14T10:00:00Z', // Started before now (12:00)
          end_at: '2025-12-14T11:00:00Z',
          locked: false,
        },
      ];

      const result = generatePreview([], [], existingEvents, mockHourSettings, {
        windowDays: 7,
        now,
      });

      // The past event should be blocked
      expect(result.steps[0]?.debug?.slotsAvailable).toBeGreaterThan(0);
    });

    it('should NOT block future habit events (they can be dynamically rescheduled)', () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'habit-event-1',
          title: 'Lunch',
          start_at: '2025-12-15T12:00:00Z', // Future event
          end_at: '2025-12-15T12:30:00Z',
          locked: false,
        },
      ];

      const result = generatePreview([], [], existingEvents, mockHourSettings, {
        windowDays: 7,
        now,
      });

      // Future habit events should NOT be blocked (can be rescheduled)
      // With only a future non-locked event, 0 events should be blocked
      expect(result.steps[0]?.debug?.slotsAvailable).toBe(0);
    });

    it('should NOT block future task events (they will be replaced)', () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'task-event-1',
          title: 'Old Task Event',
          start_at: '2025-12-15T14:00:00Z', // Future event
          end_at: '2025-12-15T16:00:00Z',
          locked: false,
        },
      ];

      const result = generatePreview([], [], existingEvents, mockHourSettings, {
        windowDays: 7,
        now,
      });

      // The task event should NOT be blocked (available for scheduling)
      // With no blocked events, blocked count should be 0
      expect(result.steps[0]?.debug?.slotsAvailable).toBe(0);
    });

    it('should skip scheduling habits on days that already have events', () => {
      const existingHabitDays = new Set(['habit-1:2025-12-15']);
      const habits: Habit[] = [
        {
          id: 'habit-1',
          name: 'Lunch',
          frequency: 'daily',
          duration_minutes: 30,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '12:00:00',
          ws_id: 'ws-1',
          color: 'blue',
          recurrence_interval: 1,
          start_date: '2025-12-14',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = generatePreview(habits, [], [], mockHourSettings, {
        windowDays: 7,
        now,
        existingHabitDays,
        timezone: 'UTC',
      });

      // Habit for 2025-12-15 should be skipped (already exists)
      // Check that no events were created for that day
      const eventsOn15th = result.events.filter((e) =>
        e.start_at.includes('2025-12-15')
      );
      expect(eventsOn15th.length).toBe(0);
    });
  });

  describe('habit deduplication', () => {
    it('should not schedule duplicate habit instances for the same day', () => {
      const existingHabitDays = new Set([
        'lunch-habit:2025-12-14',
        'lunch-habit:2025-12-15',
      ]);
      const habits: Habit[] = [
        {
          id: 'lunch-habit',
          name: 'Lunch',
          frequency: 'daily',
          duration_minutes: 30,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '12:00:00',
          ws_id: 'ws-1',
          color: 'blue',
          recurrence_interval: 1,
          start_date: '2025-12-14',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = generatePreview(habits, [], [], mockHourSettings, {
        windowDays: 3,
        now,
        existingHabitDays,
        timezone: 'UTC',
      });

      // Days 14 and 15 already have events, so only day 16+ should be scheduled
      const habitEvents = result.events.filter((e) => e.type === 'habit');
      for (const event of habitEvents) {
        expect(event.start_at).not.toContain('2025-12-14');
        expect(event.start_at).not.toContain('2025-12-15');
      }
    });
  });

  describe('task scheduling heuristics', () => {
    it('boosts near-deadline tasks ahead of less urgent work', () => {
      const limitedHourSettings = {
        workHours: {
          ...focusedWorkWeek,
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '10:00' }],
          },
        },
        personalHours: focusedWorkWeek,
        meetingHours: focusedWorkWeek,
      } as any;

      const tasks = [
        {
          id: 'task-near-deadline',
          name: 'Ship proposal',
          total_duration: 1,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'work_hours',
          priority: 'low',
          end_date: '2025-12-15T18:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
        {
          id: 'task-backlog',
          name: 'Inbox cleanup',
          total_duration: 1,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'work_hours',
          priority: 'normal',
          end_date: null,
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview([], tasks, [], limitedHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvents = result.events.filter((event) => event.type === 'task');
      expect(taskEvents).toHaveLength(1);
      expect(taskEvents[0]?.source_id).toBe('task-near-deadline');
      expect(result.tasks.events[0]?.task.id).toBe('task-near-deadline');
    });

    it('still keeps explicitly critical tasks above distant low-priority work', () => {
      const limitedHourSettings = {
        workHours: {
          ...focusedWorkWeek,
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '10:00' }],
          },
        },
        personalHours: focusedWorkWeek,
        meetingHours: focusedWorkWeek,
      } as any;

      const tasks = [
        {
          id: 'task-critical',
          name: 'Production incident',
          total_duration: 1,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'work_hours',
          priority: 'critical',
          end_date: null,
          created_at: '2025-12-01T00:00:00.000Z',
        },
        {
          id: 'task-low-deadline',
          name: 'Routine follow-up',
          total_duration: 1,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'work_hours',
          priority: 'low',
          end_date: '2025-12-22T18:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview([], tasks, [], limitedHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvents = result.events.filter((event) => event.type === 'task');
      expect(taskEvents).toHaveLength(1);
      expect(taskEvents[0]?.source_id).toBe('task-critical');
    });

    it('prefers fuller chunks before smaller fragments in a typical workday', () => {
      const tasks = [
        {
          id: 'task-1',
          name: 'Quarterly planning',
          total_duration: 4,
          scheduled_minutes: 0,
          is_splittable: true,
          min_split_duration_minutes: 60,
          max_split_duration_minutes: 120,
          calendar_hours: 'work_hours',
          priority: 'high',
          start_date: '2025-12-15T00:00:00.000Z',
          end_date: '2025-12-20T00:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview([], tasks, [], focusedHourSettings, {
        windowDays: 2,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvents = result.events.filter((event) => event.type === 'task');
      expect(taskEvents).toHaveLength(2);
      expect(taskEvents[0]?.start_at).toBe('2025-12-15T09:00:00.000Z');
      expect(taskEvents[0]?.end_at).toBe('2025-12-15T11:00:00.000Z');
      expect(taskEvents[1]?.start_at).toBe('2025-12-15T13:00:00.000Z');
      expect(taskEvents[1]?.end_at).toBe('2025-12-15T15:00:00.000Z');
    });

    it('does not split non-splittable tasks across multiple gaps', () => {
      const sparseHourSettings = {
        workHours: {
          ...focusedWorkWeek,
          monday: {
            enabled: true,
            timeBlocks: [
              { startTime: '09:00', endTime: '10:00' },
              { startTime: '11:00', endTime: '12:00' },
            ],
          },
        },
        personalHours: focusedWorkWeek,
        meetingHours: focusedWorkWeek,
      } as any;

      const tasks = [
        {
          id: 'task-2',
          name: 'Deep review',
          total_duration: 2,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'work_hours',
          priority: 'normal',
          start_date: '2025-12-15T00:00:00.000Z',
          end_date: '2025-12-16T00:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview([], tasks, [], sparseHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      expect(
        result.events.filter((event) => event.type === 'task')
      ).toHaveLength(0);
      expect(result.summary.unscheduledTasks).toBe(1);
      expect(result.tasks.events[0]?.remainingMinutes).toBe(120);
    });

    it('never schedules task time past a hard deadline', () => {
      const tasks = [
        {
          id: 'task-3',
          name: 'Client deliverable',
          total_duration: 3,
          scheduled_minutes: 0,
          is_splittable: true,
          min_split_duration_minutes: 60,
          max_split_duration_minutes: 120,
          calendar_hours: 'work_hours',
          priority: 'critical',
          start_date: '2025-12-15T00:00:00.000Z',
          end_date: '2025-12-15T14:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview([], tasks, [], focusedHourSettings, {
        windowDays: 2,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvents = result.events.filter((event) => event.type === 'task');
      expect(taskEvents).toHaveLength(2);
      expect(taskEvents[0]?.start_at).toBe('2025-12-15T09:00:00.000Z');
      expect(taskEvents[0]?.end_at).toBe('2025-12-15T11:00:00.000Z');
      expect(taskEvents[1]?.start_at).toBe('2025-12-15T11:00:00.000Z');
      expect(taskEvents[1]?.end_at).toBe('2025-12-15T12:00:00.000Z');
      expect(result.tasks.events[0]?.remainingMinutes).toBe(0);
      expect(
        taskEvents.every((event) => event.end_at <= '2025-12-15T14:00:00.000Z')
      ).toBe(true);
    });

    it('schedules overdue tasks as soon as possible instead of treating the past deadline as a hard stop', () => {
      const tasks = [
        {
          id: 'task-overdue',
          name: 'Cook dinner',
          total_duration: 2,
          scheduled_minutes: 0,
          is_splittable: true,
          min_split_duration_minutes: 60,
          max_split_duration_minutes: 120,
          calendar_hours: 'work_hours',
          priority: null,
          start_date: '2025-12-14T00:00:00.000Z',
          end_date: '2025-12-15T07:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview([], tasks, [], focusedHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvents = result.events.filter((event) => event.type === 'task');
      expect(taskEvents).toHaveLength(1);
      expect(taskEvents[0]?.source_id).toBe('task-overdue');
      expect(taskEvents[0]?.start_at).toBe('2025-12-15T09:00:00.000Z');
      expect(result.summary.unscheduledTasks).toBe(0);
    });

    it('keeps task chunks chronological within the same day', () => {
      const tasks = [
        {
          id: 'task-4',
          name: 'Spec writing',
          total_duration: 3,
          scheduled_minutes: 0,
          is_splittable: true,
          min_split_duration_minutes: 60,
          max_split_duration_minutes: 120,
          calendar_hours: 'work_hours',
          priority: 'high',
          start_date: '2025-12-15T00:00:00.000Z',
          end_date: '2025-12-16T23:59:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview([], tasks, [], focusedHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvents = result.events.filter((event) => event.type === 'task');
      expect(taskEvents).toHaveLength(2);
      expect(
        new Date(taskEvents[0]!.end_at) <= new Date(taskEvents[1]!.start_at)
      ).toBe(true);
      expect(taskEvents.map((event) => event.start_at)).toEqual([
        '2025-12-15T09:00:00.000Z',
        '2025-12-15T11:00:00.000Z',
      ]);
    });

    it('bumps lower-priority habits when an urgent task has no other room on the day', () => {
      const scarceHourSettings = {
        workHours: focusedWorkWeek,
        personalHours: {
          ...focusedWorkWeek,
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '09:45' }],
          },
        },
        meetingHours: focusedWorkWeek,
      } as any;

      const habits: Habit[] = [
        {
          id: 'habit-normal',
          name: 'Entertainment',
          frequency: 'daily',
          duration_minutes: 45,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ws_id: 'ws-1',
          color: 'blue',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const tasks = [
        {
          id: 'task-urgent',
          name: 'Prepare handoff',
          total_duration: 0.75,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'personal_hours',
          priority: 'low',
          end_date: '2025-12-15T12:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview(habits, tasks, [], scarceHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvents = result.events.filter((event) => event.type === 'task');
      const habitEvents = result.events.filter(
        (event) => event.type === 'habit'
      );

      expect(taskEvents).toHaveLength(1);
      expect(taskEvents[0]?.source_id).toBe('task-urgent');
      expect(habitEvents).toHaveLength(0);
      expect(result.summary.bumpedHabits).toBe(1);
    });

    it('pulls urgent tasks into the earliest day slot by preempting movable habits', () => {
      const scarceHourSettings = {
        workHours: focusedWorkWeek,
        personalHours: {
          ...focusedWorkWeek,
          monday: {
            enabled: true,
            timeBlocks: [
              { startTime: '09:00', endTime: '12:00' },
              { startTime: '13:00', endTime: '18:00' },
            ],
          },
        },
        meetingHours: focusedWorkWeek,
      } as any;

      const habits: Habit[] = [
        {
          id: 'habit-deep-work',
          name: 'Deep work',
          frequency: 'daily',
          duration_minutes: 180,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '09:00:00',
          ws_id: 'ws-1',
          color: 'blue',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const tasks = [
        {
          id: 'task-overdue-urgent',
          name: 'Release fix',
          total_duration: 2,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'personal_hours',
          priority: 'low',
          end_date: '2025-12-15T07:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview(habits, tasks, [], scarceHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvent = result.events.find(
        (event) =>
          event.type === 'task' && event.source_id === 'task-overdue-urgent'
      );

      expect(taskEvent).toBeTruthy();
      expect(taskEvent?.start_at).toBe('2025-12-15T09:00:00.000Z');
      expect(taskEvent?.end_at).toBe('2025-12-15T11:00:00.000Z');
      expect(result.summary.bumpedHabits).toBeGreaterThan(0);
    });

    it('rebuilds bumped habits into remaining same-day gaps after scheduling an urgent task', () => {
      const scarceHourSettings = {
        workHours: focusedWorkWeek,
        personalHours: {
          ...focusedWorkWeek,
          monday: {
            enabled: true,
            timeBlocks: [
              { startTime: '09:00', endTime: '12:00' },
              { startTime: '13:00', endTime: '18:00' },
            ],
          },
        },
        meetingHours: focusedWorkWeek,
      } as any;

      const habits: Habit[] = [
        {
          id: 'habit-deep-work',
          name: 'Deep work',
          frequency: 'daily',
          duration_minutes: 180,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ws_id: 'ws-1',
          color: 'blue',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'habit-dinner',
          name: 'Dinner',
          frequency: 'daily',
          duration_minutes: 30,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '17:00:00',
          ws_id: 'ws-1',
          color: 'red',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const tasks = [
        {
          id: 'task-overdue-urgent',
          name: 'Release fix',
          total_duration: 2,
          scheduled_minutes: 0,
          is_splittable: false,
          calendar_hours: 'personal_hours',
          priority: 'low',
          end_date: '2025-12-15T07:00:00.000Z',
          created_at: '2025-12-01T00:00:00.000Z',
        },
      ] as any[];

      const result = generatePreview(habits, tasks, [], scarceHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const taskEvent = result.events.find(
        (event) =>
          event.type === 'task' && event.source_id === 'task-overdue-urgent'
      );
      const rebuiltHabitEvents = result.events.filter(
        (event) => event.type === 'habit'
      );

      expect(taskEvent?.start_at).toBe('2025-12-15T09:00:00.000Z');
      expect(rebuiltHabitEvents.length).toBeGreaterThan(0);
      expect(
        rebuiltHabitEvents.some(
          (event) => new Date(event.start_at) >= new Date(taskEvent!.end_at)
        )
      ).toBe(true);
    });
  });

  describe('habit scheduling heuristics', () => {
    it('uses habit priority to prefer higher-priority habits when time is scarce', () => {
      const scarceHourSettings = {
        workHours: focusedWorkWeek,
        personalHours: {
          ...focusedWorkWeek,
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '19:00', endTime: '19:30' }],
          },
        },
        meetingHours: focusedWorkWeek,
      } as any;

      const habits: Habit[] = [
        {
          id: 'habit-low',
          name: 'Low Habit',
          frequency: 'daily',
          duration_minutes: 30,
          calendar_hours: 'personal_hours',
          priority: 'low',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '19:00:00',
          ws_id: 'ws-1',
          color: 'blue',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'habit-high',
          name: 'High Habit',
          frequency: 'daily',
          duration_minutes: 30,
          calendar_hours: 'personal_hours',
          priority: 'critical',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '19:00:00',
          ws_id: 'ws-1',
          color: 'red',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = generatePreview(habits, [], [], scarceHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const habitEvents = result.events.filter(
        (event) => event.type === 'habit'
      );
      expect(habitEvents).toHaveLength(1);
      expect(habitEvents[0]?.source_id).toBe('habit-high');
    });

    it('prefers slots where a long habit can actually start near its ideal time', () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'busy-morning',
          title: 'Busy Morning',
          start_at: '2025-12-15T07:00:00.000Z',
          end_at: '2025-12-15T12:00:00.000Z',
          locked: true,
        },
        {
          id: 'busy-evening-gap',
          title: 'Dinner block',
          start_at: '2025-12-15T19:00:00.000Z',
          end_at: '2025-12-15T19:30:00.000Z',
          locked: true,
        },
      ];

      const habits: Habit[] = [
        {
          id: 'habit-evening',
          name: 'Entertainment',
          frequency: 'daily',
          duration_minutes: 180,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '19:00:00',
          ws_id: 'ws-1',
          color: 'blue',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const allDaySettings = {
        workHours: {
          ...validMockWeek,
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '00:00', endTime: '24:00' }],
          },
        },
        personalHours: {
          ...validMockWeek,
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '00:00', endTime: '24:00' }],
          },
        },
        meetingHours: {
          ...validMockWeek,
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '00:00', endTime: '24:00' }],
          },
        },
      } as any;

      const result = generatePreview(
        habits,
        [],
        existingEvents,
        allDaySettings,
        {
          windowDays: 1,
          now: new Date('2025-12-15T06:00:00.000Z'),
          timezone: 'UTC',
        }
      );

      const event = result.events.find((entry) => entry.type === 'habit');
      expect(event).toBeTruthy();
      expect(event?.start_at).toBe('2025-12-15T21:00:00.000Z');
      expect(event?.end_at).toBe('2025-12-16T00:00:00.000Z');
    });

    it('supports multiple split habit instances in the same day', () => {
      const habits: Habit[] = [
        {
          id: 'habit-split',
          name: 'Walk',
          frequency: 'daily',
          duration_minutes: 180,
          is_splittable: true,
          min_duration_minutes: 60,
          max_duration_minutes: 120,
          min_instances_per_day: 1,
          ideal_instances_per_day: 2,
          max_instances_per_day: 3,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          time_preference: 'afternoon',
          ws_id: 'ws-1',
          color: 'green',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = generatePreview(habits, [], [], focusedHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const habitEvents = result.events.filter(
        (event) => event.type === 'habit'
      );
      expect(habitEvents).toHaveLength(2);
      expect(
        habitEvents.every((event) => event.source_id === 'habit-split')
      ).toBe(true);
      expect(
        habitEvents.map(
          (event) =>
            (new Date(event.end_at).getTime() -
              new Date(event.start_at).getTime()) /
            60000
        )
      ).toEqual([90, 90]);
      expect(
        new Set(habitEvents.map((event) => event.occurrence_date)).size
      ).toBe(1);
    });

    it('uses existing habit minutes before adding another split instance', () => {
      const habits: Habit[] = [
        {
          id: 'habit-existing',
          name: 'Entertainment',
          frequency: 'daily',
          duration_minutes: 180,
          is_splittable: true,
          min_duration_minutes: 45,
          max_duration_minutes: 120,
          min_instances_per_day: 1,
          ideal_instances_per_day: 2,
          max_instances_per_day: 3,
          calendar_hours: 'personal_hours',
          priority: 'normal',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ideal_time: '19:00:00',
          ws_id: 'ws-1',
          color: 'green',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = generatePreview(habits, [], [], focusedHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
        existingHabitInstanceCounts: new Map([
          ['habit-existing:2025-12-15', 1],
        ]),
        existingHabitScheduledMinutes: new Map([
          ['habit-existing:2025-12-15', 120],
        ]),
      });

      const habitEvents = result.events.filter(
        (event) =>
          event.type === 'habit' && event.source_id === 'habit-existing'
      );
      expect(habitEvents).toHaveLength(1);
      expect(
        (new Date(habitEvents[0]!.end_at).getTime() -
          new Date(habitEvents[0]!.start_at).getTime()) /
          60000
      ).toBe(60);
    });

    it('relabels split habit instances in chronological order', () => {
      const habits: Habit[] = [
        {
          id: 'habit-ordered-split',
          name: 'Deep work',
          frequency: 'daily',
          duration_minutes: 360,
          is_splittable: true,
          min_duration_minutes: 120,
          max_duration_minutes: 120,
          min_instances_per_day: 3,
          ideal_instances_per_day: 3,
          max_instances_per_day: 3,
          calendar_hours: 'work_hours',
          priority: 'high',
          auto_schedule: true,
          is_visible_in_calendar: true,
          is_active: true,
          ws_id: 'ws-1',
          color: 'green',
          recurrence_interval: 1,
          start_date: '2025-12-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const result = generatePreview(habits, [], [], focusedHourSettings, {
        windowDays: 1,
        now: new Date('2025-12-15T08:00:00.000Z'),
        timezone: 'UTC',
      });

      const titles = result.events
        .filter((event) => event.type === 'habit')
        .sort(
          (left, right) =>
            new Date(left.start_at).getTime() -
            new Date(right.start_at).getTime()
        )
        .map((event) => event.title);

      expect(titles).toEqual([
        'Deep work (1/3)',
        'Deep work (2/3)',
        'Deep work (3/3)',
      ]);
    });
  });

  describe('habit dependency graph', () => {
    it('treats after-dependencies as prerequisites', () => {
      const prerequisites = buildHabitPrerequisiteMap([
        {
          id: 'habit-breakfast',
          name: 'Breakfast',
          dependency_habit_id: null,
          dependency_type: null,
        } as Habit,
        {
          id: 'habit-deep-work',
          name: 'Deep work',
          dependency_habit_id: 'habit-breakfast',
          dependency_type: 'after',
        } as Habit,
      ]);

      expect(Array.from(prerequisites.get('habit-deep-work') ?? [])).toEqual([
        'habit-breakfast',
      ]);
    });

    it('normalizes before-dependencies into prerequisite order', () => {
      const habits = [
        {
          id: 'habit-dinner',
          name: 'Dinner',
          dependency_habit_id: null,
          dependency_type: null,
        },
        {
          id: 'habit-entertainment',
          name: 'Entertainment',
          dependency_habit_id: 'habit-dinner',
          dependency_type: 'before' as const,
        },
      ];

      const { sorted, hasCycle } = topologicallySortHabits(habits, (a, b) =>
        a.name.localeCompare(b.name)
      );

      expect(hasCycle).toBe(false);
      expect(sorted.map((habit) => habit.id)).toEqual([
        'habit-entertainment',
        'habit-dinner',
      ]);
    });
  });
});

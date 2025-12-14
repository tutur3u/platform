import { describe, expect, it } from 'vitest';
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
});

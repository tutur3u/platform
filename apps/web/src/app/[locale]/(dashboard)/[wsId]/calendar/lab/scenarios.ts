import type { CalendarScenario } from './types';

const defaultHours = {
  workHours: {
    monday: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00' }] },
    tuesday: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00' }] },
    wednesday: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00' }] },
    thursday: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00' }] },
    friday: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00' }] },
    saturday: { enabled: false, timeBlocks: [] },
    sunday: { enabled: false, timeBlocks: [] },
  },
  personalHours: {
    monday: { enabled: true, timeBlocks: [{ startTime: '07:00', endTime: '09:00' }, { startTime: '17:00', endTime: '22:00' }] },
    tuesday: { enabled: true, timeBlocks: [{ startTime: '07:00', endTime: '09:00' }, { startTime: '17:00', endTime: '22:00' }] },
    wednesday: { enabled: true, timeBlocks: [{ startTime: '07:00', endTime: '09:00' }, { startTime: '17:00', endTime: '22:00' }] },
    thursday: { enabled: true, timeBlocks: [{ startTime: '07:00', endTime: '09:00' }, { startTime: '17:00', endTime: '22:00' }] },
    friday: { enabled: true, timeBlocks: [{ startTime: '07:00', endTime: '09:00' }, { startTime: '17:00', endTime: '22:00' }] },
    saturday: { enabled: true, timeBlocks: [{ startTime: '08:00', endTime: '22:00' }] },
    sunday: { enabled: true, timeBlocks: [{ startTime: '08:00', endTime: '22:00' }] },
  },
  meetingHours: {
    monday: { enabled: true, timeBlocks: [{ startTime: '10:00', endTime: '12:00' }, { startTime: '14:00', endTime: '16:00' }] },
    tuesday: { enabled: true, timeBlocks: [{ startTime: '10:00', endTime: '12:00' }, { startTime: '14:00', endTime: '16:00' }] },
    wednesday: { enabled: true, timeBlocks: [{ startTime: '10:00', endTime: '12:00' }, { startTime: '14:00', endTime: '16:00' }] },
    thursday: { enabled: true, timeBlocks: [{ startTime: '10:00', endTime: '12:00' }, { startTime: '14:00', endTime: '16:00' }] },
    friday: { enabled: true, timeBlocks: [{ startTime: '10:00', endTime: '12:00' }, { startTime: '14:00', endTime: '16:00' }] },
    saturday: { enabled: false, timeBlocks: [] },
    sunday: { enabled: false, timeBlocks: [] },
  },
} as any;

export const PRESET_SCENARIOS: CalendarScenario[] = [
  {
    id: 'empty-slate',
    name: 'Empty Slate',
    description: 'A completely empty calendar with default settings.',
    tasks: [],
    habits: [],
    events: [],
    settings: {
      hours: defaultHours,
      timezone: 'UTC',
    },
  },
  {
    id: 'busy-morning',
    name: 'Busy Morning',
    description: 'A morning packed with habits and a critical task.',
    tasks: [
      {
        id: 'task-1',
        name: 'Urgent Project Review',
        priority: 'critical',
        total_duration: 2,
        calendar_hours: 'work_hours',
        auto_schedule: true,
      } as any,
    ],
    habits: [
      {
        id: 'habit-1',
        name: 'Morning Gym',
        duration_minutes: 60,
        frequency: 'daily',
        calendar_hours: 'personal_hours',
        priority: 'high',
        auto_schedule: true,
        time_preference: 'morning',
      } as any,
      {
        id: 'habit-2',
        name: 'Daily Standup',
        duration_minutes: 30,
        frequency: 'daily',
        calendar_hours: 'work_hours',
        priority: 'critical',
        auto_schedule: true,
        ideal_time: '09:30',
      } as any,
    ],
    events: [],
    settings: {
      hours: defaultHours,
      timezone: 'UTC',
    },
  },
  {
    id: 'overwhelmed-ceo',
    name: 'The Overwhelmed CEO',
    description: '20+ tasks, many critical, meeting-heavy days. Stress test for gap filling.',
    tasks: Array.from({ length: 25 }).map((_, i) => ({
      id: `ceo-task-${i}`,
      name: `Executive Decision ${i + 1}`,
      priority: i % 5 === 0 ? 'critical' : i % 3 === 0 ? 'high' : 'normal',
      total_duration: (i % 3) + 1,
      calendar_hours: i % 4 === 0 ? 'meeting_hours' : 'work_hours',
      auto_schedule: true,
      is_splittable: true,
    })) as any,
    habits: [
      { id: 'ceo-h1', name: 'Board Sync', duration_minutes: 60, frequency: 'daily', calendar_hours: 'work_hours', priority: 'critical', auto_schedule: true, ideal_time: '10:00' },
      { id: 'ceo-h2', name: 'Strategic Thinking', duration_minutes: 90, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'high', auto_schedule: true, time_preference: 'morning' },
      { id: 'ceo-h3', name: 'Networking Dinner', duration_minutes: 120, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'normal', auto_schedule: true, time_preference: 'evening' },
    ] as any,
    events: [
      { id: 'locked-1', title: 'Investor Pitch (LOCKED)', start_at: '2024-01-01T13:00:00Z', end_at: '2024-01-01T15:00:00Z', color: 'RED', locked: true },
      { id: 'locked-2', title: 'Flight to Singapore (LOCKED)', start_at: '2024-01-02T08:00:00Z', end_at: '2024-01-02T12:00:00Z', color: 'BLUE', locked: true },
    ] as any,
    settings: {
      hours: defaultHours,
      timezone: 'UTC',
    },
  },
  {
    id: 'streak-maintainer',
    name: 'The Streak Maintainer',
    description: 'Multiple daily habits with strict ideal times and high priority.',
    tasks: [
      { id: 'sm-t1', name: 'Light Work', priority: 'low', total_duration: 10, calendar_hours: 'work_hours', auto_schedule: true, is_splittable: true },
    ] as any,
    habits: [
      { id: 'sm-h1', name: 'Meditation', duration_minutes: 15, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'critical', auto_schedule: true, ideal_time: '07:00' },
      { id: 'sm-h2', name: 'Vitamin Intake', duration_minutes: 15, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'critical', auto_schedule: true, ideal_time: '08:00' },
      { id: 'sm-h3', name: 'Quick Review', duration_minutes: 15, frequency: 'daily', calendar_hours: 'work_hours', priority: 'critical', auto_schedule: true, ideal_time: '09:00' },
      { id: 'sm-h4', name: 'Lunch Break', duration_minutes: 60, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'critical', auto_schedule: true, ideal_time: '12:00' },
      { id: 'sm-h5', name: 'Afternoon Tea', duration_minutes: 30, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'critical', auto_schedule: true, ideal_time: '15:00' },
      { id: 'sm-h6', name: 'Workout', duration_minutes: 60, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'high', auto_schedule: true, time_preference: 'evening' },
    ] as any,
    events: [],
    settings: {
      hours: defaultHours,
      timezone: 'UTC',
    },
  },
  {
    id: 'night-owl',
    name: 'The Night Owl',
    description: 'Work and personal hours shifted to late night. Testing timezone and boundary handling.',
    tasks: [
      { id: 'no-t1', name: 'Late Night Coding', priority: 'high', total_duration: 5, calendar_hours: 'work_hours', auto_schedule: true },
    ] as any,
    habits: [
      { id: 'no-h1', name: 'Late Dinner', duration_minutes: 60, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'normal', auto_schedule: true, time_preference: 'evening' },
      { id: 'no-h2', name: 'Midnight Reading', duration_minutes: 45, frequency: 'daily', calendar_hours: 'personal_hours', priority: 'normal', auto_schedule: true, ideal_time: '23:00' },
    ] as any,
    events: [],
        settings: {
          hours: {
            ...defaultHours,
            workHours: {
              monday: { enabled: true, timeBlocks: [{ startTime: '14:00', endTime: '22:00' }] },
              tuesday: { enabled: true, timeBlocks: [{ startTime: '14:00', endTime: '22:00' }] },
              wednesday: { enabled: true, timeBlocks: [{ startTime: '14:00', endTime: '22:00' }] },
              thursday: { enabled: true, timeBlocks: [{ startTime: '14:00', endTime: '22:00' }] },
              friday: { enabled: true, timeBlocks: [{ startTime: '14:00', endTime: '22:00' }] },
              saturday: { enabled: false, timeBlocks: [] },
              sunday: { enabled: false, timeBlocks: [] },
            },
            personalHours: {
              monday: { enabled: true, timeBlocks: [{ startTime: '22:00', endTime: '03:00' }] },
              tuesday: { enabled: true, timeBlocks: [{ startTime: '22:00', endTime: '03:00' }] },
              wednesday: { enabled: true, timeBlocks: [{ startTime: '22:00', endTime: '03:00' }] },
              thursday: { enabled: true, timeBlocks: [{ startTime: '22:00', endTime: '03:00' }] },
              friday: { enabled: true, timeBlocks: [{ startTime: '22:00', endTime: '03:00' }] },
              saturday: { enabled: true, timeBlocks: [{ startTime: '12:00', endTime: '03:00' }] },
              sunday: { enabled: true, timeBlocks: [{ startTime: '12:00', endTime: '03:00' }] },
            },
          } as any,
          timezone: 'UTC',
        },
      },
      {
        id: 'weekend-warrior',
        name: 'The Weekend Warrior',
        description: 'High load on weekends, minimal on weekdays. Testing weekend hour handling.',
        tasks: Array.from({ length: 10 }).map((_, i) => ({
          id: `ww-task-${i}`,
          name: `Weekend Project ${i + 1}`,
          priority: 'high',
          total_duration: 2,
          calendar_hours: 'personal_hours',
          auto_schedule: true,
        })) as any,
        habits: [
          { id: 'ww-h1', name: 'Weekend Cleaning', duration_minutes: 120, frequency: 'weekly', calendar_hours: 'personal_hours', priority: 'normal', auto_schedule: true, time_preference: 'morning' },
        ] as any,
        events: [],
        settings: {
          hours: defaultHours,
          timezone: 'UTC',
        },
      },
      {
        id: 'back-to-back',
        name: 'Back-to-Back Loader',
        description: 'Many short tasks (30m) that should fill every available gap. Testing granularity.',
        tasks: Array.from({ length: 20 }).map((_, i) => ({
          id: `btb-task-${i}`,
          name: `Quick Task ${i + 1}`,
          priority: 'normal',
          total_duration: 0.5,
          calendar_hours: 'work_hours',
          auto_schedule: true,
        })) as any,
        habits: [],
        events: [],
            settings: {
              hours: defaultHours,
              timezone: 'UTC',
            },
          },
          {
            id: 'complex-overlaps',
            name: 'Complex Overlaps',
            description: 'Many overlapping locked events to test how the algorithm navigates tight constraints.',
            tasks: Array.from({ length: 5 }).map((_, i) => ({
              id: `co-task-${i}`,
              name: `Crucial Task ${i + 1}`,
              priority: 'high',
              total_duration: 1,
              calendar_hours: 'work_hours',
              auto_schedule: true,
            })) as any,
            habits: [],
            events: Array.from({ length: 10 }).map((_, i) => ({
              id: `co-locked-${i}`,
              title: `Meeting ${i + 1}`,
              start_at: `2024-01-01T${10 + i}:00:00Z`,
              end_at: `2024-01-01T${11 + i}:30:00Z`, // 1.5h each, overlapping every 30m
              color: 'GRAY',
              locked: true,
            })) as any,
            settings: {
              hours: defaultHours,
              timezone: 'UTC',
            },
          },
        ];
        
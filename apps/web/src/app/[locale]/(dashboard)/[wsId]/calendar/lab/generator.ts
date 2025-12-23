import { v4 as uuidv4 } from 'uuid';
import type { CalendarScenario } from './types';

const TASK_NAMES = [
  'Deep Work: AI Engine',
  'Code Review: Unified Scheduler',
  'Client Sync: Enterprise Onboarding',
  'Email Triage',
  'Planning: Roadmap 2026',
  'Bug Fix: Race Condition in Sync',
  'Learning: Rust Axum Framework',
  'Documentation: Lab Environment',
  'Design Review: Mobile App',
  'System Maintenance: Database',
];

const HABIT_NAMES = [
  'Morning Workout',
  'Afternoon Yoga',
  'Evening Journaling',
  'Stretch Break',
  'Daily Reflection',
  'Mindfulness Session',
];

const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
const HOURS = ['work_hours', 'personal_hours', 'meeting_hours'] as const;

export function generateRealisticScenario(options: {
  taskCount: number;
  habitCount: number;
}): CalendarScenario {
  const { taskCount, habitCount } = options;

  const tasks = Array.from({ length: taskCount }).map((_, i) => ({
    id: `generated-task-${i}-${uuidv4()}`,
    name: TASK_NAMES[Math.floor(Math.random() * TASK_NAMES.length)],
    priority: PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)],
    total_duration: Math.random() < 0.7 ? 1 : Math.random() < 0.9 ? 2 : 3,
    calendar_hours: HOURS[Math.floor(Math.random() * HOURS.length)],
    auto_schedule: true,
    is_splittable: Math.random() > 0.5,
  }));

  const habits = Array.from({ length: habitCount }).map((_, i) => ({
    id: `generated-habit-${i}-${uuidv4()}`,
    name: HABIT_NAMES[Math.floor(Math.random() * HABIT_NAMES.length)],
    duration_minutes: Math.random() < 0.5 ? 30 : Math.random() < 0.8 ? 60 : 90,
    frequency: 'daily',
    calendar_hours: HOURS[Math.floor(Math.random() * HOURS.length)],
    priority: PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)],
    auto_schedule: true,
    time_preference:
      Math.random() < 0.4
        ? 'morning'
        : Math.random() < 0.7
          ? 'afternoon'
          : 'evening',
  }));

  return {
    id: `random-${uuidv4()}`,
    name: `Random Scenario (${taskCount}T, ${habitCount}H)`,
    description: `A procedurally generated scenario with ${taskCount} tasks and ${habitCount} habits.`,
    tasks: tasks as any,
    habits: habits as any,
    events: [],
    settings: {
      hours: {
        workHours: {
          monday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
          },
          tuesday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
          },
          wednesday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
          },
          thursday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
          },
          friday: {
            enabled: true,
            timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
          },
          saturday: { enabled: false, timeBlocks: [] },
          sunday: { enabled: false, timeBlocks: [] },
        },
        personalHours: {
          monday: {
            enabled: true,
            timeBlocks: [
              { startTime: '07:00', endTime: '09:00' },
              { startTime: '17:00', endTime: '22:00' },
            ],
          },
          tuesday: {
            enabled: true,
            timeBlocks: [
              { startTime: '07:00', endTime: '09:00' },
              { startTime: '17:00', endTime: '22:00' },
            ],
          },
          wednesday: {
            enabled: true,
            timeBlocks: [
              { startTime: '07:00', endTime: '09:00' },
              { startTime: '17:00', endTime: '22:00' },
            ],
          },
          thursday: {
            enabled: true,
            timeBlocks: [
              { startTime: '07:00', endTime: '09:00' },
              { startTime: '17:00', endTime: '22:00' },
            ],
          },
          friday: {
            enabled: true,
            timeBlocks: [
              { startTime: '07:00', endTime: '09:00' },
              { startTime: '17:00', endTime: '22:00' },
            ],
          },
          saturday: {
            enabled: true,
            timeBlocks: [{ startTime: '08:00', endTime: '22:00' }],
          },
          sunday: {
            enabled: true,
            timeBlocks: [{ startTime: '08:00', endTime: '22:00' }],
          },
        },
        meetingHours: {
          monday: {
            enabled: true,
            timeBlocks: [
              { startTime: '10:00', endTime: '12:00' },
              { startTime: '14:00', endTime: '16:00' },
            ],
          },
          tuesday: {
            enabled: true,
            timeBlocks: [
              { startTime: '10:00', endTime: '12:00' },
              { startTime: '14:00', endTime: '16:00' },
            ],
          },
          wednesday: {
            enabled: true,
            timeBlocks: [
              { startTime: '10:00', endTime: '12:00' },
              { startTime: '14:00', endTime: '16:00' },
            ],
          },
          thursday: {
            enabled: true,
            timeBlocks: [
              { startTime: '10:00', endTime: '12:00' },
              { startTime: '14:00', endTime: '16:00' },
            ],
          },
          friday: {
            enabled: true,
            timeBlocks: [
              { startTime: '10:00', endTime: '12:00' },
              { startTime: '14:00', endTime: '16:00' },
            ],
          },
          saturday: { enabled: false, timeBlocks: [] },
          sunday: { enabled: false, timeBlocks: [] },
        },
      } as any,
      timezone: 'UTC',
    },
  };
}

import { schedules } from '@trigger.dev/sdk/v3';
import { runImmediateSync, runExtendedSync } from './google-calendar-background-sync.js';
import 'dotenv/config';

// Task 1: Immediate sync - runs every 1 minute
export const googleCalendarImmediateSync = schedules.task({
  id: 'google-calendar-immediate-sync',
  cron: {
    // every 1 minute
    pattern: '* * * * *',
  },
  run: async () => {
    await runImmediateSync();
  },
});

// Task 2: Extended sync - runs every 10 minutes
export const googleCalendarExtendedSync = schedules.task({
  id: 'google-calendar-extended-sync',
  cron: {
    // every 10 minutes
    pattern: '*/10 * * * *',
  },
  run: async () => {
    await runExtendedSync();
  },
});

// Export both tasks for registration
export const googleCalendarTasks = [
  googleCalendarImmediateSync,
  googleCalendarExtendedSync,
]; 
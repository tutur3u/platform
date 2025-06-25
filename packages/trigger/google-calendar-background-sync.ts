import { schedules } from '@trigger.dev/sdk/v3';
import { syncGoogleCalendarEvents } from './google-calendar-sync.js';
import 'dotenv/config';

export const googleCalendarBackgroundSync = schedules.task({
  id: 'google-calendar-background-sync',
  cron: {
    // every 10 minutes
    pattern: '*/10 * * * *',
  },
  run: async () => {
    await syncGoogleCalendarEvents();
  },
});

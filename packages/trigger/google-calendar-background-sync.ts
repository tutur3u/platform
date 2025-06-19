import { syncGoogleCalendarEvents } from './google-calendar-sync.js';
import { schedules } from '@trigger.dev/sdk/v3';
import 'dotenv/config';

export const googleCalendarBackgroundSync = schedules.task({
  id: 'google-calendar-background-sync',
  cron: {
    // every minute
    pattern: '* * * * *',
  },
  run: async () => {
    await syncGoogleCalendarEvents();
  },
});

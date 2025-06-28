import { syncGoogleCalendarEventsImmediate, syncGoogleCalendarEventsExtended } from './google-calendar-sync.js';

// Background sync task that runs the immediate sync every 1 minute
export const runImmediateSync = async () => {
  console.log('=== Starting immediate sync task (every 1 minute) ===');
  try {
    await syncGoogleCalendarEventsImmediate();
    console.log('=== Immediate sync task completed successfully ===');
  } catch (error) {
    console.error('Error in immediate sync task:', error);
  }
};

// Background sync task that runs the extended sync every 10 minutes
export const runExtendedSync = async () => {
  console.log('=== Starting extended sync task (every 10 minutes) ===');
  try {
    await syncGoogleCalendarEventsExtended();
    console.log('=== Extended sync task completed successfully ===');
  } catch (error) {
    console.error('Error in extended sync task:', error);
  }
};

// Main background sync orchestrator
export const runBackgroundSync = async () => {
  console.log('=== Starting Google Calendar Background Sync ===');
  
  // Run immediate sync (1 week from now, every 1 minute)
  await runImmediateSync();
  
  // Note: The extended sync (3 weeks after first week, every 10 minutes)
  // should be scheduled separately in your cron job or task scheduler
  // This function only runs the immediate sync for now
};

// Export individual functions for separate scheduling
export { syncGoogleCalendarEventsImmediate, syncGoogleCalendarEventsExtended };

import { schedules } from '@trigger.dev/sdk/v3';

export const firstScheduledTask = schedules.task({
  id: 'first-scheduled-task',
  cron: {
    // every 1 minute
    pattern: '*/1 * * * *',
  },
  run: async (payload) => {
    //when the task was scheduled to run
    //note this will be slightly different from new Date() because it takes a few ms to run the task
    console.log(payload.timestamp); //is a Date object

    //when the task was last run
    //this can be undefined if it's never been run
    console.log(payload.lastTimestamp); //is a Date object or undefined

    //the timezone the schedule was registered with, defaults to "UTC"
    //this is in IANA format, e.g. "America/New_York"
    //See the full list here: https://cloud.trigger.dev/timezones
    console.log(payload.timezone); //is a string

    //the schedule id (you can have many schedules for the same task)
    //using this you can remove the schedule, update it, etc
    console.log(payload.scheduleId); //is a string

    //you can optionally provide an external id when creating the schedule
    //usually you would set this to a userId or some other unique identifier
    //this can be undefined if you didn't provide one
    console.log(payload.externalId); //is a string or undefined

    //the next 5 dates this task is scheduled to run
    console.log(payload.upcoming); //is an array of Date objects
  },
});

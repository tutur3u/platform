import { handleCalendarRequest } from '#calendar-handler';

export default {
  fetch: handleCalendarRequest,
} satisfies ExportedHandler<CloudflareEnv>;

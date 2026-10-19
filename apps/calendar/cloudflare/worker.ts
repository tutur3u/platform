import { handleCalendarRequest } from '../src/runtime/handler';

export default {
  fetch: handleCalendarRequest,
} satisfies ExportedHandler<CloudflareEnv>;

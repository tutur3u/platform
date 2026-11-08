import { handleCalendarRequest } from '#calendar-handler';
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from '../src/runtime/worker-contract';

export default {
  fetch(
    request: Request,
    env: CalendarWorkerEnvironment,
    ctx: CalendarExecutionContext
  ) {
    return handleCalendarRequest(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;

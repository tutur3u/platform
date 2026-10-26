import { handleCalendarRequest } from '#calendar-handler';
import { forwardCalendarAcmeChallenge } from '../src/runtime/acme';
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
    const challenge = forwardCalendarAcmeChallenge(request);
    if (challenge) return challenge;
    return handleCalendarRequest(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;

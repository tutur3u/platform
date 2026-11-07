import { handleCalendarRequest } from '#calendar-handler';
import { missingSecretsResponse } from '../src/runtime/required-secrets';
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from '../src/runtime/worker-contract';

// A literal from the Vite define; the Worker tsconfig has no Node types.
declare const process: { env: { CALENDAR_DEPLOYMENT_PROFILE?: string } };

export default {
  fetch(
    request: Request,
    env: CalendarWorkerEnvironment,
    ctx: CalendarExecutionContext
  ) {
    return (
      missingSecretsResponse(process.env.CALENDAR_DEPLOYMENT_PROFILE, env) ??
      handleCalendarRequest(request, env, ctx)
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;

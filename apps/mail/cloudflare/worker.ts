import { withHstsResponsePolicy } from '@tuturuuu/start-bridge/response-policy';
import { handleMailRequest } from '#mail-handler';
import type {
  MailExecutionContext,
  MailRuntimeEnv,
} from '../src/runtime/worker-contract';

export default {
  fetch: withHstsResponsePolicy(
    (request: Request, env: MailRuntimeEnv, ctx: MailExecutionContext) => {
      return handleMailRequest(request, env, ctx);
    }
  ),
} satisfies ExportedHandler<CloudflareEnv>;

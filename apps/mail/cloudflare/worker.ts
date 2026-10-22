import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { handleMailRequest } from '#mail-handler';
import type {
  MailExecutionContext,
  MailRuntimeEnv,
} from '../src/runtime/worker-contract';

export default {
  fetch(request: Request, env: MailRuntimeEnv, ctx: MailExecutionContext) {
    return (
      workerBuildInfo(request, 'mail') ?? handleMailRequest(request, env, ctx)
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;

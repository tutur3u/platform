import { handleMailRequest } from '#mail-handler';
import type {
  MailExecutionContext,
  MailRuntimeEnv,
} from '../src/runtime/worker-contract';
import { assertRuntimeSecrets } from './runtime-secrets';

export default {
  fetch(request: Request, env: MailRuntimeEnv, ctx: MailExecutionContext) {
    assertRuntimeSecrets(env);
    return handleMailRequest(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// OpenNext owns the application; this entry fences unroutable requests and
// backstops pending responses (see @tuturuuu/utils/worker-settled-fetch).
import { withSettledResponse } from '@tuturuuu/utils/worker-settled-fetch';
import nextWorker from '../.open-next/worker.js';
import {
  isUnroutableLettinPath,
  lettinHeadersTimeoutMs,
} from '../src/request-gate';

export default {
  fetch: withSettledResponse(
    (request: Request, env: unknown, ctx: ExecutionContext) =>
      nextWorker.fetch(request, env, ctx),
    {
      app: 'lettin',
      isUnroutable: isUnroutableLettinPath,
      headersTimeoutMs: lettinHeadersTimeoutMs,
    }
  ),
};

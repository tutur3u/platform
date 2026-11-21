import { createHash, timingSafeEqual } from 'node:crypto';
import { Effect } from '@tuturuuu/utils/effect';
import { GATEWAY_HEADER } from './gateway';

type Dependencies = {
  cronSecret: string | undefined;
  loadSecret: () => Promise<string>;
  fetch: typeof fetch;
};
const response = (status: number, message: string) =>
  Response.json(
    { ok: false, message },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  );

export function forwardCalendarCron(request: Request, deps: Dependencies) {
  return Effect.runPromise(
    Effect.tryPromise(async () => {
      const path = new URL(request.url).pathname;
      if (!/^\/api\/cron\/calendar\/(provider-sync|smart-schedule)$/.test(path))
        return response(404, 'Calendar job not found');
      if (request.method !== 'GET') return response(405, 'Method not allowed');
      if (!deps.cronSecret)
        return response(503, 'Cron authentication unavailable');
      const digest = (value: string) =>
        createHash('sha256').update(value).digest();
      if (
        !timingSafeEqual(
          digest(request.headers.get('authorization') ?? ''),
          digest(`Bearer ${deps.cronSecret}`)
        )
      )
        return response(401, 'Unauthorized');

      // Authenticate the scheduler before accessing the vault. Calendar verifies
      // cron authentication again; its private hosting credential never leaves Infra.
      const secret = await deps.loadSecret();
      if (!/^[a-zA-Z0-9_-]{43,}$/.test(secret))
        return response(503, 'Calendar gateway unavailable');
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(240_000),
      ]);
      const upstream = await deps.fetch(
        `https://calendar.tuturuuu.com${path}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${deps.cronSecret}`,
            [GATEWAY_HEADER]: secret,
            Accept: 'application/json',
          },
          redirect: 'manual',
          cache: 'no-store',
          signal,
        }
      );
      if (
        (upstream.status >= 300 && upstream.status < 400) ||
        !/^application\/json(?:;|$)/i.test(
          upstream.headers.get('content-type') ?? ''
        )
      ) {
        await upstream.body?.cancel();
        return response(502, 'Calendar cron service unavailable');
      }
      const reader = upstream.body?.getReader();
      if (!reader) return response(502, 'Calendar cron response missing');
      const abort = () => {
        void reader.cancel().catch(() => {});
      };
      signal.addEventListener('abort', abort, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) {
            await reader.cancel();
            return response(502, 'Calendar cron response too large');
          }
          chunks.push(value);
        }
      } finally {
        signal.removeEventListener('abort', abort);
        reader.releaseLock();
      }
      const bytes = Buffer.concat(chunks);
      const payload: unknown = JSON.parse(bytes.toString('utf8'));
      return Response.json(payload, {
        status: upstream.status,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed(response(503, 'Calendar cron unavailable'))
      )
    )
  );
}

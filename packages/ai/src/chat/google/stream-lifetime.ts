import { consumeStream } from 'ai';
import { after } from 'next/server';

type RegisterRequestWork = (work: Promise<unknown>) => void;

/**
 * Builds the `consumeSseStream` callback for `toUIMessageStreamResponse`.
 *
 * `streamText` awaits `onFinish` and `onAbort` before its stream closes, so the
 * server-side consumption promise settles only after the assistant message and
 * credit persistence settle. Registering it with the request's `after()` keeps
 * the runtime alive for that work after the client disconnects: Next maps it to
 * the platform `waitUntil`, and the start-bridge `next/server` shim maps it to
 * the Cloudflare Worker `ctx.waitUntil`, where the isolate may otherwise stop
 * once the response stream closes.
 */
export function createPersistingSseStreamConsumer(
  register: RegisterRequestWork = after
) {
  return ({ stream }: { stream: ReadableStream }) => {
    const consumption = consumeStream({ stream });
    try {
      register(consumption);
    } catch (error) {
      // Outside a request scope (or without a waitUntil binding) the stream is
      // still consumed; only the lifetime extension is unavailable.
      console.warn('AI chat stream persistence could not extend the request.', {
        error,
      });
    }
    return consumption;
  };
}

import { MeetCallAccessError } from '../../lib/call-access';

export async function readFormBody(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  let total = 0;
  const body = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes)
          throw new MeetCallAccessError(413, 'Form request is too large');
        controller.enqueue(chunk);
      },
    })
  );
  return new Response(body).json();
}

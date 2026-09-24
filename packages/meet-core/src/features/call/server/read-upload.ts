import { MeetCallAccessError } from '../lib/call-access';

/** Bound multipart buffering even when browsers omit Content-Length. */
export async function readBoundedFormData(request: Request, maxBytes: number) {
  const length = request.headers.get('content-length');
  if (length && (!Number.isFinite(Number(length)) || Number(length) > maxBytes))
    throw new MeetCallAccessError(413, 'Upload exceeds the size limit');
  if (!request.body) throw new MeetCallAccessError(400, 'Upload is empty');
  let received = 0;
  let exceeded = false;
  const bounded = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) {
          exceeded = true;
          throw new MeetCallAccessError(413, 'Upload exceeds the size limit');
        }
        controller.enqueue(chunk);
      },
    })
  );
  try {
    return await new Response(bounded, { headers: request.headers }).formData();
  } catch {
    throw new MeetCallAccessError(
      exceeded ? 413 : 400,
      exceeded ? 'Upload exceeds the size limit' : 'Invalid upload'
    );
  }
}

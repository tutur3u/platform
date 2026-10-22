import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { z } from 'zod';
import type { StaffOperationContext } from '@/app/api/v1/product-feedback/staff-operation';
import { FEEDBACK_REQUEST_BYTES } from './product-feedback-limits';

export class FeedbackInputError extends Error {
  constructor(readonly status: 400 | 413) {
    super('feedback_invalid_submission');
  }
}
const text = (maximum: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => [...s].length >= 1 && [...s].length <= maximum);
export const feedbackInput = z
  .object({
    title: text(160),
    body: text(8000),
    idempotencyKey: z.uuidv4(),
    turnstileToken: z.string().min(1).max(2048),
    media: z
      .object({
        contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        data: z.string().min(4).max(2796204),
      })
      .strict()
      .optional(),
  })
  .strict();
export type FeedbackInput = z.infer<typeof feedbackInput>;
export const feedbackReceipt = z
  .object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }) })
  .strict();
export async function readFeedbackInput(
  request: Request,
  operation: StaffOperationContext
) {
  const maximum = FEEDBACK_REQUEST_BYTES;
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum))
    throw new FeedbackInputError(413);
  if (!request.body) throw new FeedbackInputError(400);
  const reader = request.body.getReader();
  const stop = operation.onStop(() => reader.cancel().catch(() => {}));
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      operation.check();
      const { done, value } = await reader.read();
      operation.check();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new FeedbackInputError(413);
      chunks.push(value);
    }
    try {
      return feedbackInput.parse(
        JSON.parse(Buffer.concat(chunks).toString('utf8'))
      );
    } catch {
      throw new FeedbackInputError(400);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    stop();
  }
}
export async function normalizeFeedbackMedia(
  media: NonNullable<FeedbackInput['media']>
) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(media.data))
    throw new FeedbackInputError(400);
  const bytes = Buffer.from(media.data, 'base64');
  if (bytes.toString('base64') !== media.data || bytes.length > 2097152)
    throw new FeedbackInputError(413);
  const expected =
    media.contentType === 'image/png'
      ? 'png'
      : media.contentType === 'image/jpeg'
        ? 'jpeg'
        : 'webp';
  const signature =
    expected === 'png'
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : expected === 'jpeg'
        ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        : bytes.subarray(0, 4).toString() === 'RIFF' &&
          bytes.subarray(8, 12).toString() === 'WEBP';
  if (!signature) throw new FeedbackInputError(400);
  const image = sharp(bytes, { limitInputPixels: 10000000, failOn: 'warning' });
  try {
    const metadata = await image.metadata();
    if (metadata.format !== expected || (metadata.pages ?? 1) !== 1)
      throw new FeedbackInputError(400);
    const output = await image
      .rotate()
      .resize({
        width: 1920,
        height: 1920,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 75, effort: 2 })
      .timeout({ seconds: 3 })
      .toBuffer();
    if (output.length > 524288) throw new FeedbackInputError(413);
    return output.toString('base64');
  } catch (error) {
    if (error instanceof FeedbackInputError) throw error;
    throw new FeedbackInputError(400);
  } finally {
    image.destroy();
  }
}

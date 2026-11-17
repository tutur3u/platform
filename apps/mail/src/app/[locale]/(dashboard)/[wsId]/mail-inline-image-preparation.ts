export const MAIL_INLINE_IMAGE_MAX_BYTES = 448 * 1024;
export const MAIL_INLINE_IMAGE_MAX_EDGE = 1800;
const MAX_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const TIMEOUT_MS = 15_000;

export class MailInlineImageError extends Error {
  constructor(
    readonly code: 'image_prepare_failed' | 'image_prepare_too_large'
  ) {
    super(code);
    this.name = 'MailInlineImageError';
  }
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function decode(file: File, signal?: AbortSignal) {
  if (typeof createImageBitmap !== 'function')
    throw new MailInlineImageError('image_prepare_failed');
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bitmap = createImageBitmap(file).then((value) => {
    if (expired || signal?.aborted) {
      value.close();
      checkAbort(signal);
      throw new MailInlineImageError('image_prepare_failed');
    }
    return value;
  });
  try {
    return await Promise.race([
      bitmap,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new MailInlineImageError('image_prepare_failed'));
        }, TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    checkAbort(signal);
    if (error instanceof MailInlineImageError) throw error;
    throw new MailInlineImageError('image_prepare_failed');
  } finally {
    clearTimeout(timer);
  }
}

async function rejectAnimation(file: File) {
  if (file.type !== 'image/png' && file.type !== 'image/webp') return;
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new MailInlineImageError('image_prepare_failed'));
    reader.onerror = () =>
      reject(new MailInlineImageError('image_prepare_failed'));
    reader.readAsArrayBuffer(file);
  });
  const view = new DataView(buffer);
  const png = file.type === 'image/png';
  for (let offset = png ? 8 : 12; offset + 8 <= view.byteLength;) {
    const typeOffset = png ? offset + 4 : offset;
    const type = String.fromCharCode(...new Uint8Array(buffer, typeOffset, 4));
    if (type === 'acTL' || type === 'ANIM' || type === 'ANMF')
      throw new MailInlineImageError('image_prepare_too_large');
    const length = view.getUint32(png ? offset : offset + 4, !png);
    offset += png ? length + 12 : length + 8 + (length % 2);
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new MailInlineImageError('image_prepare_failed')),
      TIMEOUT_MS
    );
    try {
      canvas.toBlob(
        (blob) => {
          clearTimeout(timer);
          if (blob) resolve(blob);
          else reject(new MailInlineImageError('image_prepare_failed'));
        },
        type,
        quality
      );
    } catch {
      clearTimeout(timer);
      reject(new MailInlineImageError('image_prepare_failed'));
    }
  });
}

/** Small images retain their bytes; large pasted images get a bounded upload. */
export async function prepareMailInlineImage(
  file: File,
  signal?: AbortSignal
): Promise<File> {
  checkAbort(signal);
  if (file.size <= MAIL_INLINE_IMAGE_MAX_BYTES) return file;
  if (
    file.size > MAX_INPUT_BYTES ||
    !/^image\/(png|jpeg|webp|bmp)$/u.test(file.type)
  )
    throw new MailInlineImageError('image_prepare_too_large');

  await rejectAnimation(file);
  checkAbort(signal);
  const bitmap = await decode(file, signal);
  try {
    checkAbort(signal);
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > MAX_PIXELS
    )
      throw new MailInlineImageError('image_prepare_too_large');
    const fit = Math.min(
      1,
      MAIL_INLINE_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const started = Date.now();
    for (const scale of [1, 0.75, 0.5, 0.33]) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * fit * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * fit * scale));
      try {
        const context = canvas.getContext('2d');
        if (!context) throw new MailInlineImageError('image_prepare_failed');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.86, 0.7, 0.54]) {
          checkAbort(signal);
          if (Date.now() - started > TIMEOUT_MS)
            throw new MailInlineImageError('image_prepare_too_large');
          const blob = await encode(canvas, type, quality);
          checkAbort(signal);
          if (blob.size > 0 && blob.size <= MAIL_INLINE_IMAGE_MAX_BYTES) {
            const extension =
              blob.type === 'image/jpeg'
                ? 'jpg'
                : blob.type === 'image/webp'
                  ? 'webp'
                  : 'png';
            return new File(
              [blob],
              `${file.name.replace(/\.[^.]*$/u, '')}.${extension}`,
              { type: blob.type, lastModified: file.lastModified }
            );
          }
        }
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
    throw new MailInlineImageError('image_prepare_too_large');
  } finally {
    bitmap.close();
  }
}

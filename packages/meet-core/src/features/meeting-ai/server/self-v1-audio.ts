import { z } from 'zod';
import { MeetAiError } from './access';

/** 350 KB request cap: one 10 s canonical WAV plus multipart overhead. */
export const MEET_SELF_REQUEST_MAX_BYTES = 350_000;
const SAMPLE_RATE = 16_000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
const MIN_PCM_BYTES = BYTES_PER_SECOND;
const MAX_PCM_BYTES = BYTES_PER_SECOND * 10;
/** Three hours of capture plus the 20 s drain, in samples. */
const MAX_START_SAMPLE = (3 * 60 * 60 + 20) * SAMPLE_RATE;

const ALLOWED_FIELDS = new Set([
  'sessionId',
  'streamId',
  'id',
  'sequence',
  'startSample',
  'consentRevision',
  'audio',
]);

const fieldsSchema = z
  .object({
    sessionId: z.uuid(),
    streamId: z.uuid(),
    id: z.uuid(),
    sequence: z.coerce.number().int().min(0).max(1080),
    startSample: z.coerce.number().int().min(0).max(MAX_START_SAMPLE),
    consentRevision: z.coerce.number().int().min(1).max(100_000),
  })
  .strict();

export type MeetSelfChunkFields = z.infer<typeof fieldsSchema>;

/**
 * The self_v1 request carries exactly the listed fields and one `audio`
 * part. Any other key (a batch, a second part, a speaker, account or source
 * field) is refused, so a client can never name whose voice it sends.
 */
export function readSelfChunkFields(
  request: Request,
  form: FormData
): MeetSelfChunkFields {
  if (request.headers.get('x-meet-audio-batch') !== null)
    throw new MeetAiError(400, 'Batched audio is not accepted');
  const seen = new Set<string>();
  const values: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (!ALLOWED_FIELDS.has(key) || seen.has(key))
      throw new MeetAiError(400, 'Invalid audio fields');
    seen.add(key);
    if (key === 'audio') {
      if (!(value instanceof File)) throw new MeetAiError(400, 'Invalid audio');
      continue;
    }
    if (typeof value !== 'string')
      throw new MeetAiError(400, 'Invalid audio fields');
    values[key] = value;
  }
  if (!seen.has('audio')) throw new MeetAiError(400, 'Missing audio');
  const parsed = fieldsSchema.safeParse(values);
  if (!parsed.success) throw new MeetAiError(400, 'Invalid audio fields');
  return parsed.data;
}

function canonicalHeader(pcmBytes: number) {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++)
      header[offset + index] = text.charCodeAt(index);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, BYTES_PER_SECOND, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcmBytes, true);
  return header;
}

/**
 * Accepts only a canonical mono 16 kHz PCM16 WAV holding 1 to 10 seconds.
 * The duration comes from the byte count, and the provider receives the PCM
 * under a server-built header, never the client's.
 */
export async function readSelfChunkAudio(form: FormData) {
  const audio = form.get('audio');
  if (
    !(audio instanceof File) ||
    audio.size < 44 + MIN_PCM_BYTES ||
    audio.size > 44 + MAX_PCM_BYTES
  )
    throw new MeetAiError(400, 'Audio must hold 1 to 10 seconds');
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, size: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + size));
  const pcmBytes = bytes.length - 44;
  if (
    ascii(0, 4) !== 'RIFF' ||
    ascii(8, 8) !== 'WAVEfmt ' ||
    ascii(36, 4) !== 'data' ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== SAMPLE_RATE ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== pcmBytes ||
    pcmBytes % 2 !== 0
  )
    throw new MeetAiError(400, 'Invalid PCM audio');
  const pcm = bytes.subarray(44);
  const wav = new Uint8Array(bytes.length);
  wav.set(canonicalHeader(pcmBytes), 0);
  wav.set(pcm, 44);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pcm));
  return {
    wav,
    durationSeconds: pcmBytes / BYTES_PER_SECOND,
    durationMs: Math.round((pcmBytes / BYTES_PER_SECOND) * 1000),
    digestHex: [...digest]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
  };
}

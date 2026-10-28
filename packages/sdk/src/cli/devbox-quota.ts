import { z } from 'zod';

const Quota = z.object({
  code: z.enum(['DEVBOX_LIMIT_REACHED', 'DEVBOX_LIMIT_EXCEEDS_GRANT']),
  limit: z.string(),
  used: z.number(),
  max: z.number(),
  resetsAt: z.string(),
  messages: z.object({ en: z.string(), vi: z.string() }),
});
export function printDevboxQuotaError(
  error: unknown,
  json: boolean,
  locale = process.env.LANG ?? 'en'
) {
  const envelope = z
    .object({ status: z.number(), payload: Quota.passthrough() })
    .safeParse(error);
  if (!envelope.success) return false;
  const parsed = Quota.safeParse(envelope.data.payload);
  if (!parsed.success) return false;
  if (json) process.stdout.write(`${JSON.stringify(envelope.data.payload)}\n`);
  else
    process.stderr.write(
      `${locale.startsWith('vi') ? parsed.data.messages.vi : parsed.data.messages.en} ${parsed.data.limit}: ${parsed.data.used}/${parsed.data.max}; ${parsed.data.resetsAt}\n`
    );
  process.exitCode = envelope.data.status === 429 ? 75 : 65;
  return true;
}

export async function createRunWithQuota<T>(
  create: () => Promise<T>,
  json: boolean
): Promise<T | undefined> {
  try {
    return await create();
  } catch (error) {
    if (printDevboxQuotaError(error, json)) return;
    throw error;
  }
}

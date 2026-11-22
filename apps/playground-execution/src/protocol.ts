import { cloudPlaygroundRunId } from '@tuturuuu/utils/playground-cloud-run-id';
import { PlaygroundJob } from '@tuturuuu/utils/playground-schema';
import { z } from 'zod';
import type { RunRequest, RunRow } from './admission';

export const RunIdentity = z.strictObject({
  ownerId: z.uuid(),
  projectId: z.uuid(),
  meetingId: z.uuid(),
});

export const RunSubmission = RunIdentity.extend({
  requester: z.uuid(),
  requestId: z.uuid(),
  revision: z.number().int().nonnegative(),
  stdin: z.string().max(65536).optional(),
  sourceTicket: z.string().min(60).max(2048),
  exportTicket: z.string().min(60).max(2048),
});

export const RunLookup = RunIdentity.extend({ runId: z.uuid() });
export const RunWriteback = RunLookup.extend({
  revision: z.number().int().nonnegative(),
});
export const GuestJob = PlaygroundJob.refine((job) => job.operation === 'run');

export type RunIdentity = z.infer<typeof RunIdentity>;
export type RunSubmission = z.infer<typeof RunSubmission>;
export type RunLookup = z.infer<typeof RunLookup>;
export type RunWriteback = z.infer<typeof RunWriteback>;
export type RunClaim = Pick<
  RunRow,
  'run_id' | 'generation' | 'slot' | 'deadline'
>;

const encoder = new TextEncoder();

export function bytes(text: string) {
  return encoder.encode(text);
}

export function hex(input: Uint8Array) {
  return Array.from(input, (value) => value.toString(16).padStart(2, '0')).join(
    ''
  );
}

async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(text)));
}

export function projectScope(identity: RunIdentity) {
  return `${identity.meetingId}:${identity.ownerId}`;
}

export async function identifyRun(
  submission: RunSubmission
): Promise<RunRequest> {
  return {
    runId: await cloudPlaygroundRunId(submission),
    scopeId: projectScope(submission),
    requester: submission.requester,
    projectId: submission.projectId,
    revision: submission.revision,
  };
}

export async function authenticated(
  request: Request,
  secret: string | undefined
) {
  const bearer = request.headers.get('Authorization');
  if (!secret || secret.length < 32 || !bearer?.startsWith('Bearer '))
    return false;
  const presented = bearer.slice(7);
  if (!presented || presented.length > 256) return false;
  const [expectedHash, presentedHash] = await Promise.all([
    digest(secret),
    digest(presented),
  ]);
  return crypto.subtle.timingSafeEqual(expectedHash, presentedHash);
}

export async function readBoundedJson(
  request: Request | Response,
  max: number
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing execution payload');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let payload = '';
  try {
    for (;;) {
      const read = await reader.read();
      if (read.done) return JSON.parse(payload + decoder.decode());
      length += read.value.byteLength;
      if (length > max) {
        void reader.cancel().catch(() => {});
        throw new Error('Execution payload too large');
      }
      payload += decoder.decode(read.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

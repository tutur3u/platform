import { createHash, timingSafeEqual } from 'node:crypto';
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
  claimId: z.uuid().optional(),
  savedRevision: z.number().int().nonnegative().optional(),
});
export const GuestJob = PlaygroundJob.refine((job) => job.operation === 'run');

const CheckPath = z
  .string()
  .max(240)
  .refine(
    (path) =>
      path
        .split('/')
        .every(
          (part) =>
            /^[a-zA-Z0-9_.@+-]+$/u.test(part) &&
            ![
              '.',
              '..',
              '.git',
              '.venv',
              'node_modules',
              '__pycache__',
              'target',
            ].includes(part)
        ),
    'Invalid path'
  );
export const CheckSubmission = z
  .strictObject({
    meetingId: z.uuid(),
    requester: z.uuid(),
    requestId: z.uuid(),
    language: z.enum(['c', 'cpp', 'java']),
    files: z
      .array(
        z.strictObject({
          path: CheckPath,
          content: z
            .string()
            .refine(
              (content) =>
                !content.includes('\0') &&
                new TextEncoder().encode(content).byteLength <= 128 * 1024,
              'Invalid content'
            ),
        })
      )
      .min(1)
      .max(20),
    entry: CheckPath.optional(),
  })
  .refine(
    ({ files }) =>
      new Set(files.map(({ path }) => path)).size === files.length &&
      files.reduce(
        (total, { content }) =>
          total + new TextEncoder().encode(content).byteLength,
        0
      ) <=
        200 * 1024,
    'Invalid check inventory'
  );
export type CheckSubmission = z.infer<typeof CheckSubmission>;

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

function digest(text: string) {
  return createHash('sha256').update(text).digest();
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

export function authenticated(request: Request, secret: string | undefined) {
  const bearer = request.headers.get('Authorization');
  if (!secret || secret.length < 32 || !bearer?.startsWith('Bearer '))
    return false;
  const presented = bearer.slice(7);
  if (!presented || presented.length > 256) return false;
  return timingSafeEqual(digest(secret), digest(presented));
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

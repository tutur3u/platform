import { z } from 'zod';
import {
  FORM_UPLOAD_MAX_BYTES,
  FORM_UPLOAD_MIME_TYPES,
  formPublishedDefinitionSchema,
  formRespondentUploadKey,
  formUploadAnswerSchema,
  type PublishedFormLaunchScope,
  type PublishedFormScope,
  publishedFormIdSchema,
  publishedFormLaunchScopeSchema,
} from './forms-source';

const launchSchema = z.object({
  roomId: z.string(),
  launchId: publishedFormIdSchema,
  formId: publishedFormIdSchema,
  versionId: publishedFormIdSchema,
  form: z.object({ id: publishedFormIdSchema, wsId: publishedFormIdSchema }),
});
const revealPolicy = z.enum(['never', 'after_submit', 'manual']);
const revealPoliciesSchema = z.object({
  id: publishedFormIdSchema,
  form_id: publishedFormIdSchema,
  ws_id: publishedFormIdSchema,
  score_reveal: revealPolicy,
  answer_reveal: revealPolicy,
});
type AccessMode = 'anonymous' | 'authenticated' | 'authenticated_email';
export const respondentUploadScopeSchema = z.string().regex(/^[0-9a-f]{64}$/);
const uploadSchema = z.object({
  actor_scope: respondentUploadScopeSchema,
  id: publishedFormIdSchema,
  ws_id: publishedFormIdSchema,
  form_id: publishedFormIdSchema,
  version_id: publishedFormIdSchema,
  launch_id: publishedFormIdSchema,
  question_id: publishedFormIdSchema,
  content_type: z.enum(FORM_UPLOAD_MIME_TYPES),
  size_bytes: z.number().int().min(1).max(FORM_UPLOAD_MAX_BYTES),
  ready_at: z.string().min(1),
  meeting_id: publishedFormIdSchema,
  claimed_response_id: publishedFormIdSchema,
  cleanup_started_at: z.null(),
});

type Context = { meetingId: string; wsId: string };
type Launch = PublishedFormLaunchScope & { roomId: string };

export type ExtendedFormsDependencies = {
  readLaunch: (
    launchId: string,
    audience: 'participant' | 'manager'
  ) => Promise<unknown>;
  requireManager: () => Promise<void>;
  authorizePublication: (scope: PublishedFormScope) => Promise<AccessMode>;
  readPublication: (scope: PublishedFormScope) => Promise<unknown>;
  readRevealPolicies: (scope: PublishedFormScope) => Promise<unknown>;
  readManualRelease: (scope: PublishedFormLaunchScope) => Promise<unknown>;
  recordRelease: (scope: PublishedFormLaunchScope) => Promise<void>;
  readSubmittedResponse: (
    scope: Launch,
    responseId: string
  ) => Promise<string | null>;
  readReadyUpload: (
    scope: Launch,
    uploadId: string,
    actorScope: string,
    responseId: string
  ) => Promise<unknown>;
  readFileAnswer: (responseId: string, questionId: string) => Promise<unknown>;
  download: (key: string) => Promise<Blob | null>;
};

function absent() {
  return { status: 'not_found' } as const;
}

async function resolveLaunch(
  context: Context,
  launchId: string,
  audience: 'participant' | 'manager',
  deps: ExtendedFormsDependencies
): Promise<Launch | null> {
  const parsed = launchSchema.safeParse(
    await deps.readLaunch(launchId, audience)
  );
  if (!parsed.success) return null;
  const launch = parsed.data;
  if (
    launch.roomId !== `${context.wsId}:${context.meetingId}` ||
    launch.launchId !== launchId ||
    launch.form.id !== launch.formId ||
    launch.form.wsId !== context.wsId
  )
    return null;
  return {
    roomId: context.meetingId,
    wsId: context.wsId,
    launchId: launch.launchId,
    formId: launch.formId,
    versionId: launch.versionId,
  };
}

async function readScopedRevealPolicies(
  scope: PublishedFormScope,
  deps: ExtendedFormsDependencies
) {
  const policy = revealPoliciesSchema.safeParse(
    await deps.readRevealPolicies(scope)
  );
  if (
    !policy.success ||
    policy.data.id !== scope.versionId ||
    policy.data.form_id !== scope.formId ||
    policy.data.ws_id !== scope.wsId
  )
    return null;
  return policy.data;
}

async function readQuizReveal(
  launch: Launch,
  deps: ExtendedFormsDependencies,
  proof?: {
    responseId: string;
    resolveActorScope: (scope: PublishedFormScope) => string;
  }
) {
  const hidden = { score: false, answers: false };
  if (!proof) return hidden;
  const sessionScope = respondentUploadScopeSchema.safeParse(
    await deps.readSubmittedResponse(launch, proof.responseId)
  );
  if (
    !sessionScope.success ||
    sessionScope.data !== proof.resolveActorScope(launch)
  )
    return hidden;

  const policy = await readScopedRevealPolicies(launch, deps);
  if (!policy) return hidden;

  let released = false;
  if (policy.score_reveal === 'manual' || policy.answer_reveal === 'manual') {
    const release = publishedFormLaunchScopeSchema.safeParse(
      await deps.readManualRelease(launch)
    );
    released =
      release.success &&
      release.data.wsId === launch.wsId &&
      release.data.formId === launch.formId &&
      release.data.versionId === launch.versionId &&
      release.data.launchId === launch.launchId;
  }
  const canReveal = (value: z.infer<typeof revealPolicy>) =>
    value === 'after_submit' || (value === 'manual' && released);
  return {
    score: canReveal(policy.score_reveal),
    answers: canReveal(policy.answer_reveal),
  };
}

export async function readExtendedFormPublication(
  context: Context,
  launchId: string,
  deps: ExtendedFormsDependencies,
  proof?: {
    responseId: string;
    resolveActorScope: (scope: PublishedFormScope) => string;
  }
) {
  const launch = await resolveLaunch(context, launchId, 'participant', deps);
  if (!launch) return absent();
  const accessMode = await deps.authorizePublication(launch);
  const parsed = formPublishedDefinitionSchema.safeParse(
    await deps.readPublication(launch)
  );
  if (
    !parsed.success ||
    parsed.data.wsId !== launch.wsId ||
    parsed.data.id !== launch.formId
  )
    return absent();
  const form = parsed.data;
  const now = Date.now();
  if (
    form.accessMode !== accessMode ||
    (form.openAt && Date.parse(form.openAt) > now) ||
    (form.closeAt && Date.parse(form.closeAt) < now)
  )
    return { status: 'closed' } as const;
  return {
    status: 'ok',
    publication: {
      launchId: launch.launchId,
      formId: launch.formId,
      versionId: launch.versionId,
      form,
      quizReveal: await readQuizReveal(launch, deps, proof),
    },
  } as const;
}

export async function releaseExtendedFormQuiz(
  context: Context,
  launchId: string,
  deps: ExtendedFormsDependencies
) {
  await deps.requireManager();
  const launch = await resolveLaunch(context, launchId, 'manager', deps);
  if (!launch) return absent();
  const policy = await readScopedRevealPolicies(launch, deps);
  if (!policy) return absent();
  const score = policy.score_reveal === 'manual';
  const answers = policy.answer_reveal === 'manual';
  if (!score && !answers) return { status: 'policy_denied' } as const;

  const { wsId, formId, versionId } = launch;
  await deps.recordRelease({
    wsId,
    formId,
    versionId,
    launchId: launch.launchId,
  });
  return { status: 'released', score, answers } as const;
}

export async function downloadExtendedFormResponseFile(
  context: Context,
  input: { launchId: string; responseId: string; uploadId: string },
  deps: ExtendedFormsDependencies
) {
  await deps.requireManager();
  const launch = await resolveLaunch(context, input.launchId, 'manager', deps);
  if (!launch) return absent();
  const actorScope = respondentUploadScopeSchema.safeParse(
    await deps.readSubmittedResponse(launch, input.responseId)
  );
  if (!actorScope.success) return absent();

  const parsed = uploadSchema.safeParse(
    await deps.readReadyUpload(
      launch,
      input.uploadId,
      actorScope.data,
      input.responseId
    )
  );
  if (!parsed.success) return absent();
  const upload = parsed.data;
  if (
    upload.id !== input.uploadId ||
    upload.claimed_response_id !== input.responseId ||
    upload.meeting_id !== launch.roomId ||
    upload.actor_scope !== actorScope.data ||
    upload.ws_id !== launch.wsId ||
    upload.form_id !== launch.formId ||
    upload.version_id !== launch.versionId ||
    upload.launch_id !== launch.launchId
  )
    return absent();

  const answer = formUploadAnswerSchema.safeParse(
    await deps.readFileAnswer(input.responseId, upload.question_id)
  );
  if (!answer.success || !answer.data.includes(upload.id)) return absent();

  const file = await deps.download(formRespondentUploadKey(upload));
  if (!file || file.size !== upload.size_bytes) return absent();
  return {
    status: 'ok',
    response: new Response(file, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment',
        'Content-Length': String(file.size),
        'Content-Type': upload.content_type,
        'X-Content-Type-Options': 'nosniff',
      },
    }),
  } as const;
}

import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { MeetCallAccessError } from '../../lib/call-access';
import { callRoomService } from '../room-service';
import { createInlineLaunch } from './creation';
import {
  formVersionId,
  loadFormSnapshot,
  meetFormLaunchSchema,
} from './definition';
import { formStudioSchema, resolveFormDefinitionMedia } from './forms-source';
import { createMeetFormsAdmin } from './forms-rpc';
import {
  acceptsFormResponses,
  type FormAccess,
  type FormAdmin,
  getVerifiedFormAccount,
  readWorkspaceForm,
  requireFormManager,
  requireFormResultsAccess,
  submissionPolicy,
} from './policy';
import { formChallenge } from './submission-proof';

export const launchReferenceSchema = z.strictObject({
  formId: z.guid(),
  versionId: z.uuid(),
});
export const launchActionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('launch'),
    formId: z.guid(),
    versionId: z.uuid().optional(),
    launchId: z.uuid().optional(),
  }),
  z.strictObject({
    action: z.literal('create'),
    requestId: z.uuid(),
    definition: formStudioSchema,
  }),
  z.strictObject({
    action: z.literal('mira_draft'),
    prompt: z.string().trim().min(1).max(600),
    locale: z.enum(['en', 'vi']).default('en'),
  }),
]);

export async function readMeetFormResultsScope(
  access: FormAccess,
  launchId: string
) {
  const db = await createAdminClient({ noCookie: true });
  await requireFormResultsAccess(access, db);
  return meetFormLaunchSchema.parse(
    await callRoomService(access, { action: 'forms.results_scope', launchId })
  );
}

export async function getParticipantLaunch(
  access: FormAccess,
  db: FormAdmin,
  launchId: string,
  reference: z.output<typeof launchReferenceSchema>
) {
  const launch = meetFormLaunchSchema.parse(
    await callRoomService(access, { action: 'forms.get', launchId })
  );
  if (
    launch.launchId !== launchId ||
    launch.formId !== reference.formId ||
    launch.versionId !== reference.versionId ||
    launch.form.id !== launch.formId ||
    launch.form.wsId !== access.meeting.ws_id
  ) {
    throw new MeetCallAccessError(404, 'Form launch not found');
  }

  const current = await readWorkspaceForm(
    db,
    access.meeting.ws_id,
    launch.formId
  );
  const policy = submissionPolicy(launch.form, current);
  if (!policy.acceptingResponses)
    throw new MeetCallAccessError(410, 'Form is closed');
  const account =
    policy.accessMode === 'anonymous'
      ? null
      : await getVerifiedFormAccount(access, db);
  if (policy.accessMode !== 'anonymous' && !account)
    throw new MeetCallAccessError(403, 'Account required to respond');
  if (policy.accessMode === 'authenticated_email' && !account?.email)
    throw new MeetCallAccessError(403, 'Confirmed email required to respond');

  return { launch, policy, account, policyRevision: current.updated_at };
}

async function projectLaunch(
  db: FormAdmin,
  meeting: FormAccess['meeting'],
  launch: z.output<typeof meetFormLaunchSchema>,
  current: Awaited<ReturnType<typeof readWorkspaceForm>>
) {
  const policy = submissionPolicy(launch.form, current);
  const {
    id,
    title,
    description,
    status,
    accessMode,
    openAt,
    closeAt,
    maxResponses,
    theme,
    settings,
    sections,
    logicRules,
  } = await resolveFormDefinitionMedia(db, launch.form);
  return {
    launchId: launch.launchId,
    formId: launch.formId,
    versionId: launch.versionId,
    form: {
      id,
      title,
      description,
      status,
      accessMode,
      openAt,
      closeAt,
      maxResponses,
      theme,
      settings,
      sections,
      logicRules,
    },
    submissionPolicy: policy,
    turnstile: policy.requireTurnstile
      ? formChallenge(meeting, launch, current.updated_at)
      : null,
  };
}

export async function listFormLaunches(access: FormAccess) {
  const { launches } = z
    .object({ launches: z.array(meetFormLaunchSchema).max(8) })
    .parse(await callRoomService(access, { action: 'forms.list' }));
  if (!launches.length) return { launches: [] };

  const db = await createAdminClient({ noCookie: true });
  const { data: forms, error } = await db
    .schema('private')
    .from('forms')
    .select('*')
    .eq('ws_id', access.meeting.ws_id)
    .in('id', [...new Set(launches.map((launch) => launch.formId))]);
  if (error) throw new MeetCallAccessError(503, 'Form launches unavailable');
  const byId = new Map(forms.map((form) => [form.id, form]));

  const account = launches.some(
    (launch) => launch.form.accessMode !== 'anonymous'
  )
    ? await getVerifiedFormAccount(access, db)
    : null;
  return {
    launches: await Promise.all(
      launches.flatMap((launch) => {
        const row = byId.get(launch.formId);
        if (!row || launch.form.id !== row.id || launch.form.wsId !== row.ws_id)
          return [];
        if (launch.form.accessMode !== row.access_mode) return [];
        if (row.access_mode !== 'anonymous' && !account) return [];
        if (row.access_mode === 'authenticated_email' && !account?.email)
          return [];
        return [projectLaunch(db, access.meeting, launch, row)];
      })
    ),
  };
}

export async function listLaunchableForms(access: FormAccess) {
  const db = await createAdminClient({ noCookie: true });
  await requireFormManager(access, db);
  await callRoomService(access, { action: 'forms.authorize' });
  const { data, error } = await db
    .schema('private')
    .from('forms')
    .select('id, title, access_mode, open_at, close_at, status')
    .eq('ws_id', access.meeting.ws_id)
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw new MeetCallAccessError(503, 'Forms unavailable');
  return {
    items: data
      .filter((form) => acceptsFormResponses(form))
      .map((form) => ({
        formId: form.id,
        title: form.title,
        accessMode: form.access_mode,
      })),
  };
}

export async function runFormLaunchAction(
  access: FormAccess,
  action: z.output<typeof launchActionSchema>
) {
  const db = await createMeetFormsAdmin();
  await requireFormManager(access, db);
  await callRoomService(access, { action: 'forms.authorize' });
  if (action.action === 'mira_draft') {
    const { draftMeetForm } = await import('./mira-draft');
    return draftMeetForm(access, action);
  }

  const wsId = access.meeting.ws_id;
  const inline = action.action === 'create';
  const intent = inline
    ? await createInlineLaunch(db, access, action.requestId, action.definition)
    : null;
  const launchFromIntent = intent?.launch;
  const formId =
    action.action === 'launch' ? action.formId : launchFromIntent?.formId;
  if (!formId)
    throw new MeetCallAccessError(503, 'Form creation could not be confirmed');
  const row = await readWorkspaceForm(db, wsId, formId);
  if (!intent && !acceptsFormResponses(row))
    throw new MeetCallAccessError(409, 'Form is not open for responses');

  const form = launchFromIntent?.form ?? (await loadFormSnapshot(db, row));
  const versionId = launchFromIntent?.versionId ?? formVersionId(form);
  if (!inline && action.versionId && action.versionId !== versionId)
    throw new MeetCallAccessError(409, 'Form version is unavailable');
  const launchId =
    launchFromIntent?.launchId ??
    (action.action === 'launch' ? action.launchId : undefined) ??
    crypto.randomUUID();

  try {
    const stored = meetFormLaunchSchema.parse(
      await callRoomService(access, {
        action: 'forms.launch',
        launch: { launchId, formId, versionId, form },
      })
    );
    if (
      stored.launchId !== launchId ||
      stored.formId !== formId ||
      stored.versionId !== versionId ||
      stored.form.id !== formId ||
      stored.form.wsId !== wsId
    ) {
      throw new MeetCallAccessError(503, 'Form launch could not be confirmed');
    }
    if (intent) await intent.finalize();
    const current = intent ? await readWorkspaceForm(db, wsId, formId) : row;
    return await projectLaunch(db, access.meeting, stored, current);
  } catch (error) {
    if (action.action === 'launch' && !action.launchId) throw error;
    return Response.json(
      {
        error: 'Form launch could not be confirmed',
        recovery: {
          launchId,
          formId,
          versionId,
          ...(action.action === 'create'
            ? { requestId: action.requestId }
            : {}),
        },
      },
      { status: error instanceof MeetCallAccessError ? error.status : 503 }
    );
  }
}

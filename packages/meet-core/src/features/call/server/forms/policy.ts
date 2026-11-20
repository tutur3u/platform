import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { MeetCallAccessError } from '../../lib/call-access';
import type { getMeetCallAccess } from '../../lib/call-access';
import { type FormDefinition, type FormRow } from './forms-source';

export type FormAccess = Awaited<ReturnType<typeof getMeetCallAccess>>;
export type FormAdmin = Awaited<ReturnType<typeof createAdminClient<Database>>>;

async function requireFormsPermission(
  access: FormAccess,
  db: FormAdmin,
  permissions: readonly ('manage_forms' | 'view_form_analytics')[]
) {
  if (!access.isHost || !access.canReadWorkspace)
    throw new MeetCallAccessError(403, 'Meeting host access required');
  const checks = await Promise.all(
    permissions.map((permission) =>
      db.rpc('has_workspace_permission', {
        p_permission: permission,
        p_user_id: access.user.id,
        p_ws_id: access.meeting.ws_id,
      })
    )
  );
  if (checks.some(({ data, error }) => !error && data === true)) return;
  if (checks.some(({ error }) => error))
    throw new MeetCallAccessError(503, 'Forms permission unavailable');
  throw new MeetCallAccessError(403, 'Forms permission required');
}

export function requireFormManager(access: FormAccess, db: FormAdmin) {
  return requireFormsPermission(access, db, ['manage_forms']);
}

export function requireFormResultsAccess(access: FormAccess, db: FormAdmin) {
  return requireFormsPermission(access, db, [
    'manage_forms',
    'view_form_analytics',
  ]);
}

export function acceptsFormResponses(
  form: Pick<FormRow, 'status' | 'open_at' | 'close_at'>,
  now = Date.now()
) {
  return (
    form.status === 'published' &&
    (!form.open_at || Date.parse(form.open_at) <= now) &&
    (!form.close_at || Date.parse(form.close_at) >= now)
  );
}

export async function readWorkspaceForm(
  db: FormAdmin,
  wsId: string,
  formId: string
) {
  const { data, error } = await db
    .schema('private')
    .from('forms')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', formId)
    .maybeSingle();
  if (error) throw new MeetCallAccessError(503, 'Form unavailable');
  if (!data) throw new MeetCallAccessError(404, 'Form not found');
  return data;
}

function hasSetting(
  settings: FormRow['settings'],
  key: string,
  value: boolean
) {
  return (
    settings !== null &&
    typeof settings === 'object' &&
    !Array.isArray(settings) &&
    settings[key] === value
  );
}

export function submissionPolicy(
  form: Pick<
    FormDefinition,
    'accessMode' | 'closeAt' | 'maxResponses' | 'openAt' | 'settings'
  >,
  current: FormRow
) {
  const currentRequiresTurnstile = !hasSetting(
    current.settings,
    'requireTurnstile',
    false
  );
  const limits = [form.maxResponses, current.max_responses].filter(
    (limit): limit is number => limit != null
  );
  return {
    accessMode: form.accessMode,
    acceptingResponses:
      acceptsFormResponses(current) &&
      form.accessMode === current.access_mode &&
      (!form.openAt || Date.parse(form.openAt) <= Date.now()) &&
      (!form.closeAt || Date.parse(form.closeAt) >= Date.now()),
    requireTurnstile:
      form.settings.requireTurnstile || currentRequiresTurnstile,
    allowMultipleSubmissions:
      form.settings.allowMultipleSubmissions &&
      !hasSetting(current.settings, 'allowMultipleSubmissions', false),
    oneResponsePerUser:
      form.settings.oneResponsePerUser ||
      hasSetting(current.settings, 'oneResponsePerUser', true),
    maxResponses: limits.length ? Math.min(...limits) : null,
  };
}

export async function getVerifiedFormAccount(
  access: FormAccess,
  db: FormAdmin
) {
  const { data, error } = await db.auth.admin.getUserById(access.user.id);
  if (error) throw new MeetCallAccessError(503, 'Account identity unavailable');
  if (!data.user || data.user.id !== access.user.id || data.user.is_anonymous)
    return null;
  return {
    id: data.user.id,
    email:
      data.user.email_confirmed_at && data.user.email ? data.user.email : null,
  };
}

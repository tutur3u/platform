import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { z } from 'zod';
import {
  type getMeetCallAccess,
  MeetCallAccessError,
} from '../../lib/call-access';
import { callRoomService } from '../room-service';
import { FORM_RESPONDENT_UPLOAD_BUCKET } from './forms-source';
import {
  type ExtendedFormsDependencies,
  respondentUploadScopeSchema,
} from './operations';

const submittedUploadMetadata = z.object({
  meetUploadActorScope: respondentUploadScopeSchema,
});
const accessModeSchema = z.enum([
  'anonymous',
  'authenticated',
  'authenticated_email',
]);
type MeetAccess = Awaited<ReturnType<typeof getMeetCallAccess>>;
type QuizReleaseInsert =
  Database['private']['Tables']['form_quiz_releases']['Insert'];

function unavailable() {
  return new MeetCallAccessError(503, 'Extended form unavailable');
}

export async function createExtendedFormsStore(
  access: MeetAccess
): Promise<ExtendedFormsDependencies> {
  const db = await createAdminClient({ noCookie: true });
  const forms = db.schema('private');
  return {
    readLaunch(launchId, audience) {
      return callRoomService(access, {
        action: audience === 'manager' ? 'forms.results_scope' : 'forms.get',
        launchId,
        publication: true,
      });
    },

    async requireManager() {
      if (!access.isHost || !access.canReadWorkspace)
        throw new MeetCallAccessError(403, 'Meeting host access required');
      const { data, error } = await db.rpc('has_workspace_permission', {
        p_permission: 'manage_forms',
        p_user_id: access.user.id,
        p_ws_id: access.meeting.ws_id,
      });
      if (error) throw unavailable();
      if (data !== true)
        throw new MeetCallAccessError(403, 'Forms permission required');
    },

    async authorizePublication({ wsId, formId }) {
      const { data: row, error } = await forms
        .from('forms')
        .select('access_mode, status, open_at, close_at')
        .eq('id', formId)
        .eq('ws_id', wsId)
        .maybeSingle();
      if (error) throw unavailable();
      if (!row) throw new MeetCallAccessError(404, 'Form not found');
      const now = Date.now();
      if (
        row.status !== 'published' ||
        (row.open_at && Date.parse(row.open_at) > now) ||
        (row.close_at && Date.parse(row.close_at) < now)
      )
        throw new MeetCallAccessError(410, 'Form is closed');

      const mode = accessModeSchema.safeParse(row.access_mode);
      if (!mode.success) throw unavailable();
      if (mode.data !== 'anonymous') {
        const { data, error: userError } = await db.auth.admin.getUserById(
          access.user.id
        );
        if (userError) throw unavailable();
        if (
          !data.user ||
          data.user.id !== access.user.id ||
          data.user.is_anonymous ||
          (mode.data === 'authenticated_email' &&
            (!data.user.email || !data.user.email_confirmed_at))
        )
          throw new MeetCallAccessError(403, 'Form account access required');
      }
      return mode.data;
    },

    async readPublication({ wsId, formId, versionId }) {
      const { data, error } = await forms
        .from('form_published_versions')
        .select('definition')
        .eq('id', versionId)
        .eq('form_id', formId)
        .eq('ws_id', wsId)
        .maybeSingle();
      if (error) throw unavailable();
      return data?.definition;
    },

    async readRevealPolicies({ wsId, formId, versionId }) {
      const { data, error } = await forms
        .from('form_published_versions')
        .select('id, form_id, ws_id, score_reveal, answer_reveal')
        .eq('id', versionId)
        .eq('form_id', formId)
        .eq('ws_id', wsId)
        .maybeSingle();
      if (error) throw unavailable();
      return data;
    },

    async readManualRelease({ wsId, formId, versionId, launchId }) {
      const { data, error } = await forms
        .from('form_quiz_releases')
        .select('ws_id, form_id, version_id, launch_id')
        .eq('ws_id', wsId)
        .eq('form_id', formId)
        .eq('version_id', versionId)
        .eq('launch_id', launchId)
        .maybeSingle();
      if (error) throw unavailable();
      return (
        data && {
          wsId: data.ws_id,
          formId: data.form_id,
          versionId: data.version_id,
          launchId: data.launch_id,
        }
      );
    },

    async recordRelease({ wsId, formId, versionId, launchId }) {
      const release = {
        ws_id: wsId,
        form_id: formId,
        version_id: versionId,
        launch_id: launchId,
        released_by: access.user.id,
      } satisfies QuizReleaseInsert & { released_by: string };
      const { error } = await forms
        .from('form_quiz_releases')
        .upsert<QuizReleaseInsert>(release, {
          onConflict: 'version_id,launch_id',
          ignoreDuplicates: true,
        });
      if (error) throw unavailable();
    },

    async readSubmittedResponse(scope, responseId) {
      const { data: response, error } = await forms
        .from('form_responses')
        .select('session_id')
        .eq('id', responseId)
        .eq('form_id', scope.formId)
        .eq('completion_state', 'submitted')
        .maybeSingle();
      if (error) throw unavailable();
      if (!response?.session_id) return null;
      const { data: session, error: sessionError } = await forms
        .from('form_sessions')
        .select('metadata')
        .eq('id', response.session_id)
        .eq('form_id', scope.formId)
        .contains('metadata', {
          meetRoomId: scope.roomId,
          meetLaunchId: scope.launchId,
          meetVersionId: scope.versionId,
        })
        .not('submitted_at', 'is', null)
        .maybeSingle();
      if (sessionError) throw unavailable();
      const metadata = submittedUploadMetadata.safeParse(session?.metadata);
      return metadata.success ? metadata.data.meetUploadActorScope : null;
    },

    async readReadyUpload(scope, uploadId, actorScope, responseId) {
      const { data, error } = await forms
        .from('form_respondent_uploads')
        .select(
          'id, ws_id, form_id, version_id, launch_id, question_id, actor_scope, content_type, size_bytes, ready_at, cleanup_started_at, meeting_id, claimed_response_id'
        )
        .eq('id', uploadId)
        .eq('ws_id', scope.wsId)
        .eq('form_id', scope.formId)
        .eq('version_id', scope.versionId)
        .eq('launch_id', scope.launchId)
        .eq('actor_scope', actorScope)
        // The upload lifecycle migration adds both columns before typegen.
        .filter('meeting_id', 'eq', scope.roomId)
        .filter('claimed_response_id', 'eq', responseId)
        .not('ready_at', 'is', null)
        .is('cleanup_started_at', null)
        .maybeSingle();
      if (error) throw unavailable();
      return data;
    },

    async readFileAnswer(responseId, questionId) {
      const { data, error } = await forms
        .from('form_response_answers')
        .select('answer_json')
        .eq('response_id', responseId)
        .eq('question_id', questionId)
        .eq('question_type', 'file_upload')
        .maybeSingle();
      if (error) throw unavailable();
      return data?.answer_json;
    },

    async download(key) {
      const { data, error } = await db.storage
        .from(FORM_RESPONDENT_UPLOAD_BUCKET)
        .download(key);
      if (error) {
        if (
          ('statusCode' in error && String(error.statusCode) === '404') ||
          ('status' in error && String(error.status) === '404')
        )
          return null;
        throw unavailable();
      }
      return data;
    },
  };
}

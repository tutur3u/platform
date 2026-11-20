import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type getMeetCallAccess,
  MeetCallAccessError,
} from '../../lib/call-access';
import { readMeetFormResultsScope } from '../forms/launches';
import { aggregateFormsResults } from './aggregate';

type Access = Awaited<ReturnType<typeof getMeetCallAccess>>;
const PAGE_SIZE = 25;

export async function loadLaunchResults(access: Access, launchId: string) {
  if (!access.isHost || !access.canReadWorkspace) {
    throw new MeetCallAccessError(
      403,
      'Form results are restricted to the host'
    );
  }
  const launch = await readMeetFormResultsScope(access, launchId);
  if (
    !launch ||
    launch.launchId !== launchId ||
    launch.form.id !== launch.formId ||
    launch.form.wsId !== access.meeting.ws_id
  )
    return null;

  const db = await createAdminClient({ noCookie: true });
  const forms = db.schema('private');
  const form = await forms
    .from('forms')
    .select('id')
    .eq('id', launch.formId)
    .eq('ws_id', access.meeting.ws_id)
    .maybeSingle();
  if (form.error) throw new MeetCallAccessError(503, 'Form is unavailable');
  if (!form.data) return null;

  const responses: Parameters<typeof aggregateFormsResults>[1] = [];
  let afterId: string | undefined;
  const readStartedAt = new Date().toISOString();
  const signal = AbortSignal.timeout(8000);
  for (;;) {
    let page = forms
      .from('form_responses')
      .select(
        'id, session:form_sessions!inner(id), answers:form_response_answers(*)'
      )
      .eq('form_id', launch.formId)
      .eq('session.form_id', launch.formId)
      .eq('session.metadata->>meetRoomId', access.meeting.id)
      .eq('session.metadata->>meetLaunchId', launch.launchId)
      .eq('session.metadata->>meetVersionId', launch.versionId)
      .lte('session.submitted_at', readStartedAt)
      .lte('submitted_at', readStartedAt)
      .order('id')
      .limit(PAGE_SIZE)
      .abortSignal(signal);
    if (afterId) page = page.gt('id', afterId);

    const { data, error } = await page;
    if (error || !data)
      throw new MeetCallAccessError(503, 'Form responses are unavailable');
    responses.push(...data);
    const last = data.at(-1);
    if (data.length < PAGE_SIZE || !last) break;
    afterId = last.id;
  }

  return aggregateFormsResults(
    { ...launch, meetingId: access.meeting.id },
    responses
  );
}

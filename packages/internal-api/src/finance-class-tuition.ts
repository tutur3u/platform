import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withEducationBootstrapBaseUrl,
} from './client';

export type ClassTuitionStatus =
  | 'paid'
  | 'pending'
  | 'excluded'
  | 'no_billable_activity';

export type ClassTuitionResponse = {
  class_id: string;
  month: string;
  role: 'teacher' | 'administrator' | 'student' | 'guardian';
  data: { contact_id: string; status: ClassTuitionStatus }[];
  next_cursor: string | null;
};

type ClassTuitionQuery = {
  month: string;
} & (
  | { view: 'staff'; after?: string }
  | { view: 'learning'; studentId?: string | null }
);

export async function getClassTuition(
  wsId: string,
  classId: string,
  query: ClassTuitionQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withEducationBootstrapBaseUrl(options));
  const search = new URLSearchParams({ month: query.month, view: query.view });
  if (query.view === 'staff' && query.after) search.set('after', query.after);
  if (query.view === 'learning' && query.studentId) {
    search.set('student_id', query.studentId);
  }
  return client.json<ClassTuitionResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/finance/classes/${encodePathSegment(classId)}/tuition?${search}`,
    { cache: 'no-store', signal: AbortSignal.timeout(15_000) }
  );
}

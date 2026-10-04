import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withLearnApiBaseUrl,
  withTeachApiBaseUrl,
} from './client';
export type EducationTodoKind =
  | 'tutoring'
  | 'assignments'
  | 'lessons'
  | 'tests';
export interface EducationTodoItem {
  id: string;
  title: string | null;
  participantName: string | null;
  courseId: string | null;
  date: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  completed: boolean;
}
export interface EducationTodoResponse {
  data: EducationTodoItem[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export function listEducationTodo(
  app: 'learn' | 'teach',
  wsId: string,
  query: { kind: EducationTodoKind; page: number; pageSize?: number },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(
    app === 'learn'
      ? withLearnApiBaseUrl(options)
      : withTeachApiBaseUrl(options)
  );
  return client.json<EducationTodoResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/${app === 'learn' ? 'tulearn' : 'teach'}/todo`,
    { cache: 'no-store', query }
  );
}

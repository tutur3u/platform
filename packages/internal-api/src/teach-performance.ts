import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTeachApiBaseUrl,
} from './client';
export interface TeachDashboardCourseStat {
  id: string;
  name: string;
  members_count: number;
  modules_count: number;
  pending_grading: number;
  not_submitted: number;
  low_scorers: number;
  starting_date: string | null;
  ending_date: string | null;
}

export interface TeachDashboardStatsResponse {
  courses: TeachDashboardCourseStat[];
  total_pending_grading: number;
  total_not_submitted: number;
  total_low_scorers: number;
}

export function getTeachDashboardStats(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<TeachDashboardStatsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/dashboard-stats`,
    { cache: 'no-store' }
  );
}

export interface StudentPerformanceStat {
  userId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  totalQuizzes: number;
  answeredCount: number;
  correctCount: number;
  pendingGradingCount: number;
  scorePercent: number | null;
  totalModules: number;
  completedModules: number;
  lastActivityAt: string | null;
  isLowScorer: boolean;
  hasNotSubmitted: boolean;
}

export interface CourseStudentPerformanceResponse {
  students: StudentPerformanceStat[];
  totalModules: number;
  totalQuizzes: number;
}

export function getCourseStudentPerformance(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<CourseStudentPerformanceResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/student-performance`,
    { cache: 'no-store' }
  );
}

export function sendStudentPerformanceReport(
  workspaceId: string,
  courseId: string,
  userId: string,
  locale?: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const query = locale ? { locale } : undefined;
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/student-performance/${encodePathSegment(userId)}/send-report`,
    { method: 'POST', cache: 'no-store', query }
  );
}

export function sendBulkStudentPerformanceReport(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<{
    message: string;
    sentCount: number;
    failedCount: number;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/student-performance/send-bulk-report`,
    { method: 'POST', cache: 'no-store' }
  );
}

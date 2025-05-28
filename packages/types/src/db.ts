import { Database, Tables } from './supabase';

export type AIChat = Tables<'ai_chats'>;
export type AIPrompt = Tables<'workspace_ai_prompts'>;
export type AIWhitelistEmail = Tables<'ai_whitelisted_emails'>;
export type WorkspaceDocument = Tables<'workspace_documents'>;
export type GroupPostCheck = Tables<'user_group_post_checks'>;
export type EmailHistoryEntry = Tables<'sent_emails'>;
export type Invoice = Tables<'finance_invoices'>;
export type InvoiceProduct = Tables<'finance_invoice_products'>;
export type InvoicePromotion = Tables<'finance_invoice_promotions'>;
export type Workspace = Tables<'workspaces'>;
export type WorkspaceUser = Tables<'workspace_users'>;
export type WorkspaceUserRole = 'MEMBER' | 'ADMIN' | 'OWNER';
export type WorkspaceFlashcard = Tables<'workspace_flashcards'>;
export type WorkspaceQuiz = Tables<'workspace_quizzes'>;
export type WorkspaceTaskBoard = Tables<'workspace_boards'> & {
  lists?: Partial<WorkspaceTaskList>[];
};
export type WorkspaceTaskList = Tables<'task_lists'> & {
  tasks?: Partial<WorkspaceTask>[];
};
export type WorkspaceTask = Tables<'tasks'>;
export type WorkspaceCalendarEvent = Tables<'workspace_calendar_events'>;
export type User = Tables<'users'>;
export type UserPrivateDetails = Tables<'user_private_details'>;
export type PlatformUser = Tables<'platform_user_roles'>;
export type WorkspaceQuizSet = Tables<'workspace_quiz_sets'> & {
  href?: string;
  usage?: {
    module_id: string;
    course_id: string;
    module_name: string;
    course_name: string;
  }[];
};
export type WorkspaceCourse = Tables<'workspace_courses'> & {
  href?: string;
};
export type WorkspaceCourseModule = Tables<'workspace_course_modules'> & {
  href?: string;
};
export type WorkspaceAIModel = Tables<'workspace_ai_models'> & {
  href?: string;
};
export type WorkspaceDataset = Tables<'workspace_datasets'> & {
  href?: string;
};
export type CrawledUrl = Tables<'crawled_urls'> & {
  href?: string;
};
export type WorkspaceCronJob = Tables<'workspace_cron_jobs'> & {
  href?: string;
};
export type WorkspaceCronExecution = Tables<'workspace_cron_executions'> & {
  href?: string;
};
export type AIWhitelistDomain = Tables<'ai_whitelisted_domains'>;
export type PermissionId =
  Database['public']['Enums']['workspace_role_permission'];
export type WorkspaceRole = Tables<'workspace_roles'> & {
  permissions: {
    id: PermissionId;
    enabled: boolean;
  }[];
  user_count?: number;
};
export type WorkspaceUserReport = Tables<'external_user_monthly_reports'> & {
  href?: string;
};
export type WorkspaceCalendarGoogleToken = Tables<'calendar_auth_tokens'>;

export type AuroraStatisticalForecast = Tables<'aurora_statistical_forecast'>;
export type AuroraStatisticalMetrics = Tables<'aurora_statistical_metrics'>;
export type AuroraMLForecast = Tables<'aurora_ml_forecast'>;
export type AuroraMLMetrics = Tables<'aurora_ml_metrics'>;
export type AuroraForecast = {
  statistical_forecast: AuroraStatisticalForecast[];
  ml_forecast: AuroraMLForecast[];
};

export type NovaChallengeCriteria = Tables<'nova_challenge_criteria'>;
export type NovaChallenge = Tables<'nova_challenges'>;
export type NovaChallengeWhitelistedEmail =
  Tables<'nova_challenge_whitelisted_emails'>;
export type NovaProblemTestCase = Tables<'nova_problem_test_cases'>;
export type NovaProblem = Tables<'nova_problems'>;
export type NovaRole = Tables<'platform_email_roles'>;
export type NovaRoleBasic = Pick<
  Tables<'platform_email_roles'>,
  'email' | 'enabled' | 'created_at'
>;
export type NovaSession = Tables<'nova_sessions'>;
export type NovaSubmission = Tables<'nova_submissions'>;
export type NovaSubmissionCriteria = Tables<'nova_submission_criteria'>;
export type NovaSubmissionTestCase = Tables<'nova_submission_test_cases'>;
export type NovaSubmissionWithScores = Tables<'nova_submissions_with_scores'>;
export type NovaSubmissionWithScoresAndCriteria =
  Tables<'nova_submissions_with_scores'> & {
    criteria: NovaChallengeCriteria[];
  };

export type ExtendedNovaProblem = NovaProblem & {
  test_cases?: NovaProblemTestCase[];
  challenge?: {
    id: string;
    title: string;
  };
};

export type NovaExtendedChallenge = NovaChallenge & {
  criteria?: NovaChallengeCriteria[];
  whitelists?: NovaChallengeWhitelistedEmail[];
  managingAdmins?: string[];
  canManage?: boolean;
  lastSession: NovaSession | null;
  total_sessions?: number;
  daily_sessions?: number;
};

export type NovaSubmissionData = NovaSubmissionWithScores & {
  session: NovaSession | null;
  problem: NovaProblem;
  challenge: NovaChallenge;
  criteria: (NovaSubmissionCriteria & { name: string; description: string })[];
  test_cases: (NovaSubmissionTestCase & {
    input: string;
    expected_output: string;
  })[];
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  };
};

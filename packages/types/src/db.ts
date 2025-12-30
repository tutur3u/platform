import type { Database, Tables } from './supabase';

export type AIChat = Tables<'ai_chats'>;
export type AIPrompt = Tables<'workspace_ai_prompts'>;
export type AIWhitelistEmail = Tables<'ai_whitelisted_emails'>;
export type WorkspaceAIExecution = Tables<'workspace_ai_executions'>;
export type WorkspaceDocument = Tables<'workspace_documents'>;
export type GroupPostCheck = Tables<'user_group_post_checks'>;
export type EmailHistoryEntry = Tables<'sent_emails'>;
export type Invoice = Tables<'finance_invoices'>;
export type InvoiceProduct = Tables<'finance_invoice_products'>;
export type InvoicePromotion = Tables<'finance_invoice_promotions'>;
export type Workspace = Tables<'workspaces'>;
export type WorkspaceUser = Tables<'workspace_users'>;
export type WorkspaceFlashcard = Tables<'workspace_flashcards'>;
export type WorkspaceQuiz = Tables<'workspace_quizzes'>;
export type WorkspaceTaskBoard = Tables<'workspace_boards'> & {
  href?: string;
  lists?: Partial<WorkspaceTaskList>[];
};
export type WorkspaceTaskList = Tables<'task_lists'> & {
  tasks?: Partial<WorkspaceTask>[];
};
export type WorkspaceTask = Tables<'tasks'>;
export type TaskLabel = Tables<'workspace_task_labels'>;
export type TaskProject = Tables<'task_projects'>;
export type TaskProjectUpdate = Tables<'task_project_updates'>;
export type TaskCalendarEvent = Tables<'task_calendar_events'>;
export type WorkspaceHabit = Tables<'workspace_habits'>;
export type HabitCalendarEventRow = Tables<'habit_calendar_events'>;
export type HabitCompletionRow = Tables<'habit_completions'>;

/**
 * Calendar hours type for task scheduling
 */
export type CalendarHoursType =
  | 'work_hours'
  | 'personal_hours'
  | 'meeting_hours';

/**
 * Task with scheduling-related fields for auto-scheduling
 */
export type TaskWithScheduling = WorkspaceTask & {
  total_duration?: number | null;
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: CalendarHoursType | null;
  auto_schedule?: boolean | null;
  scheduled_events?: TaskCalendarEvent[];
  // Computed fields for progress tracking
  scheduled_minutes?: number;
  completed_minutes?: number;
  // Workspace context for cross-workspace scheduling
  ws_id?: string;
};

/**
 * Minimal user information for relations
 * Used across various entities (projects, tasks, comments, etc.)
 */
export type RelatedUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Task project with nested relations as returned from database queries
 * Used in project detail pages with full context
 */
export type TaskProjectWithRelations = TaskProject & {
  creator?: RelatedUser | null;
  lead?: RelatedUser | null;
};

/**
 * Project update with nested relations as returned from database queries
 * Used in project updates UI with creator info and reaction groups
 */
export type ProjectUpdate = TaskProjectUpdate & {
  creator?: {
    display_name?: string;
    avatar_url?: string;
  };
  reactionGroups?: Array<{
    emoji: string;
    count: number;
  }>;
};

/**
 * Task with nested relations as returned from database queries
 * Used in UI components that display task lists with full context
 */
export type TaskWithRelations = {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  end_date?: string | null;
  start_date?: string | null;
  estimation_points?: number | null;
  archived?: boolean | null;
  list_id?: string | null;
  list: {
    id: string;
    name: string | null;
    status?: string | null;
    board: {
      id: string;
      name: string | null;
      ws_id: string;
      estimation_type?: string | null;
      extended_estimation?: boolean;
      allow_zero_estimates?: boolean;
      workspaces: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url?: string | null;
    } | null;
  }> | null;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color: string;
      created_at: string;
    } | null;
  }> | null;
  projects?: Array<{
    project: TaskProject | null;
  }>;
};

export type WorkspaceCalendarEvent = Tables<'workspace_calendar_events'>;
export type WorkspaceCalendar = Tables<'workspace_calendars'>;
export type WorkspaceEncryptionKey = Tables<'workspace_encryption_keys'>;
export type CalendarConnection = Tables<'calendar_connections'>;

// Calendar enums
export type WorkspaceCalendarType =
  Database['public']['Enums']['workspace_calendar_type'];
export type CalendarProvider = Database['public']['Enums']['calendar_provider'];
export type CalendarSchedulingSource =
  Database['public']['Enums']['calendar_scheduling_source'];

export type User = Tables<'users'>;
export type UserPrivateDetails = Tables<'user_private_details'>;
export type PlatformUser = Tables<'platform_user_roles'>;
export type WorkspaceApiKey = Tables<'workspace_api_keys'>;
export type WorkspaceApiKeyUsageLog = {
  id: string;
  api_key_id: string;
  ws_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address: string | null;
  user_agent: string | null;
  response_time_ms: number | null;
  request_params: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};
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
  members?: Array<{
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  }>;
};

export type PermissionSource = 'creator' | 'default' | 'role';

export type PermissionWithSource = {
  id: PermissionId;
  enabled: boolean;
  source: PermissionSource;
  source_name?: string; // role name if source is 'role'
};

export type MemberWithPermissions = {
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  };
  is_creator: boolean;
  roles: Array<{
    id: string;
    name: string;
    permissions: Array<{ id: PermissionId; enabled: boolean }>;
  }>;
  default_permissions: Array<{ id: PermissionId; enabled: boolean }>;
  total_permissions: number;
};

export type WorkspaceUserReport = Tables<'external_user_monthly_reports'> & {
  href?: string;
};
export type WorkspaceCalendarGoogleToken = Tables<'calendar_auth_tokens'>;
export type InternalEmail = Tables<'internal_emails'>;

export type TimeTrackingCategory = Tables<'time_tracking_categories'>;
export type TimeTrackingSession = Tables<'time_tracking_sessions'>;
export type TimeTrackingGoal = Tables<'time_tracking_goals'>;

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
export type CourseCertificate = Tables<'course_certificates'>;
export type CertificateTemplate =
  Database['public']['Enums']['certificate_templates'];

export type WorkspaceEducationAccessRequest =
  Tables<'workspace_education_access_requests'>;

export type RecordingStatus = Database['public']['Enums']['recording_status'];
export type RecordingTranscript = Tables<'recording_transcripts'>;

export type SupportInquiry = Tables<'support_inquiries'>;
export type SupportType = Database['public']['Enums']['support_type'];
export type Product = Database['public']['Enums']['product'];

export type WorkspaceSubscription = Tables<'workspace_subscriptions'>;
export type WorkspaceSubscriptionProduct =
  Tables<'workspace_subscription_products'>;
export type WorkspaceSubscriptionWithProduct = WorkspaceSubscription & {
  workspace_subscription_products: WorkspaceSubscriptionProduct | null;
};
export type WorkspaceProductTier =
  Database['public']['Enums']['workspace_product_tier'];
export type SubscriptionStatus =
  Database['public']['Enums']['subscription_status'];

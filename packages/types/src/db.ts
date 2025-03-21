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
export type WorkspaceFlashcard = Tables<'workspace_flashcards'>;
export type WorkspaceQuiz = Tables<'workspace_quizzes'>;

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
export type NovaProblemCriteriaScore = Tables<'nova_problem_criteria_scores'>;
export type NovaProblemTestCase = Tables<'nova_problem_testcases'>;
export type NovaProblem = Tables<'nova_problems'>;
export type NovaRole = Tables<'nova_roles'>;
export type NovaSession = Tables<'nova_sessions'>;
export type NovaSubmissionOutput = Tables<'nova_submission_outputs'>;
export type NovaSubmission = Tables<'nova_submissions'>;

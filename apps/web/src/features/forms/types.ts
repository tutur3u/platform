import type { Tables } from '@tuturuuu/types';
import type {
  FormLogicRuleInput,
  FormQuestionInput,
  FormSectionInput,
  FormSettingsInput,
  FormStudioInput,
  FormThemeInput,
} from './schema';

export type FormRow = Tables<'forms'>;
export type FormSectionRow = Tables<'form_sections'>;
export type FormQuestionRow = Tables<'form_questions'>;
export type FormQuestionOptionRow = Tables<'form_question_options'>;
export type FormLogicRuleRow = Tables<'form_logic_rules'>;
export type FormShareLinkRow = Tables<'form_share_links'>;
export type FormSessionRow = Tables<'form_sessions'>;
export type FormResponseRow = Tables<'form_responses'>;
export type FormResponseAnswerRow = Tables<'form_response_answers'>;

export interface FormDefinitionQuestion
  extends Omit<FormQuestionInput, 'options' | 'settings'> {
  id: string;
  sectionId: string;
  settings: FormQuestionInput['settings'];
  options: Array<{
    id: string;
    label: string;
    value: string;
    image: FormQuestionInput['options'][number]['image'];
  }>;
}

export interface FormDefinitionSection
  extends Omit<FormSectionInput, 'questions'> {
  id: string;
  questions: FormDefinitionQuestion[];
}

export interface FormDefinition
  extends Omit<
    FormStudioInput,
    'sections' | 'logicRules' | 'theme' | 'settings'
  > {
  id: string;
  wsId: string;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  sections: FormDefinitionSection[];
  logicRules: Array<FormLogicRuleInput & { id: string }>;
  theme: FormThemeInput;
  settings: FormSettingsInput;
  shareCode?: string | null;
}

export interface FormListItem {
  id: string;
  title: string;
  description: string | null;
  status: FormRow['status'];
  accessMode: FormRow['access_mode'];
  responseCount: number;
  viewCount: number;
  completionRate: number;
  publishedAt: string | null;
  updatedAt: string;
  href: string;
}

export interface FormAnalytics {
  totalViews: number;
  totalStarts: number;
  totalSubmissions: number;
  totalAbandons: number;
  startRate: number;
  completionRate: number;
  completionFromStartsRate: number;
  avgCompletionSeconds: number;
  uniqueReferrers: number;
  uniqueCountries: number;
  responderModeBreakdown: Array<{
    label: string;
    value: number;
  }>;
  topReferrers: Array<{
    label: string;
    value: number;
  }>;
  devices: Array<{
    label: string;
    value: number;
  }>;
  browsers: Array<{
    label: string;
    value: number;
  }>;
  operatingSystems: Array<{
    label: string;
    value: number;
  }>;
  countries: Array<{
    label: string;
    value: number;
  }>;
  cities: Array<{
    label: string;
    value: number;
  }>;
  dropoffBySection: Array<{
    sectionId: string;
    title: string;
    count: number;
  }>;
  dropoffByQuestion: Array<{
    questionId: string;
    title: string;
    count: number;
  }>;
  activity: Array<{
    date: string;
    views: number;
    starts: number;
    submissions: number;
  }>;
}

export interface FormResponseRecord {
  id: string;
  sessionId: string | null;
  createdAt: string;
  submittedAt: string;
  respondentEmail: string | null;
  respondentUserId: string | null;
  answers: Record<
    string,
    {
      value: string;
      unresolvedValues: string[];
    }
  >;
}

export interface FormResponseSummary {
  totalSubmissions: number;
  totalResponders: number;
  authenticatedResponders: number;
  anonymousSubmissions: number;
  duplicateAuthenticatedResponders: number;
  duplicateAuthenticatedSubmissions: number;
  hasMultipleSubmissionsByUser: boolean;
}

export interface FormResponsesQuestionAnalytics {
  questionId: string;
  title: string;
  type: FormQuestionInput['type'];
  totalAnswers: number;
  choices?: Array<{
    label: string;
    value: string;
    count: number;
    percentage: number;
  }>;
  scale?: Array<{
    score: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  unmatchedAnswers?: Array<{
    value: string;
    count: number;
    percentage: number;
  }>;
  textResponses?: Array<{
    value: string;
    count: number;
    percentage: number;
  }>;
  meanScore?: number;
}

export type FormAnswerValue = string | number | string[] | null;

export interface FormReadOnlyAnswerIssue {
  questionId: string | null;
  questionTitle: string;
  originalAnswer: string;
}

export interface FormReadOnlyAnswers {
  answers: Record<string, FormAnswerValue>;
  issues: FormReadOnlyAnswerIssue[];
  submittedAt: string | null;
  responseId: string | null;
  sessionId: string | null;
}

import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import {
  createStoredAnswerQuestionResolver,
  formatAnswerForQuestion,
  restoreAnswerForQuestion,
} from '../answer-utils';
import { normalizeMarkdownToText } from '../content';
import {
  buildQuestionAnalytics,
  buildResponseSummary,
} from '../response-analytics';
import type {
  FormDefinition,
  FormListItem,
  FormReadOnlyAnswers,
  FormResponseAnswerRow,
  FormResponseRecord,
  FormResponseRow,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
  FormRow,
  FormSessionRow,
} from '../types';
import {
  extractStoredAnswerValue,
  fetchResponseAnswersByIds,
  fetchResponseMetadataByIds,
  formatAnswerForDisplay,
} from './answers';
import { getPrivateFormsClient, runUntypedRpc } from './client';

export async function listForms(
  supabase: SupabaseClient<Database>,
  wsId: string,
  workspaceSlug: string,
  query?: string
): Promise<FormListItem[]> {
  const formsClient = getPrivateFormsClient(supabase);
  let formsQuery = formsClient
    .from('forms')
    .select('*')
    .eq('ws_id', wsId)
    .order('updated_at', { ascending: false });

  if (query) {
    formsQuery = formsQuery.ilike('title', `%${query}%`);
  }

  const { data: forms } = await formsQuery;
  const formRows = (forms ?? []) as FormRow[];
  const formIds = formRows.map((form) => form.id);

  if (formIds.length === 0) {
    return [];
  }

  const [{ data: sessions }, { data: responses }] = await Promise.all([
    formsClient
      .from('form_sessions')
      .select('form_id, started_at, submitted_at')
      .in('form_id', formIds),
    formsClient.from('form_responses').select('form_id').in('form_id', formIds),
  ]);
  const sessionRows = (sessions ?? []) as Array<
    Pick<FormSessionRow, 'form_id' | 'started_at' | 'submitted_at'>
  >;
  const responseRows = (responses ?? []) as Array<
    Pick<FormResponseRow, 'form_id'>
  >;

  return formRows.map((form) => {
    const formSessions = sessionRows.filter((session) => {
      return session.form_id === form.id;
    });
    const formResponses = responseRows.filter(
      (response) => response.form_id === form.id
    );
    const views = formSessions.length;
    const completionRate =
      views === 0 ? 0 : Math.round((formResponses.length / views) * 100);

    return {
      id: form.id,
      title: form.title,
      description: form.description,
      status: form.status,
      accessMode: form.access_mode,
      responseCount: formResponses.length,
      viewCount: views,
      completionRate,
      publishedAt: form.published_at,
      updatedAt: form.updated_at,
      href: `/${workspaceSlug}/forms/${form.id}`,
    };
  });
}

export async function listFormResponses(
  supabase: SupabaseClient<Database>,
  form: FormDefinition,
  options: {
    query?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{
  total: number;
  records: FormResponseRecord[];
  summary: FormResponseSummary;
  questionAnalytics: FormResponsesQuestionAnalytics[];
}> {
  const pageSize = options.pageSize ?? 10;
  const page = options.page ?? 1;
  const [responsePage, matchedResponseIdsResult] = await Promise.all([
    runUntypedRpc<
      Array<{
        id: string;
        session_id: string | null;
        created_at: string;
        submitted_at: string;
        respondent_email: string | null;
        respondent_user_id: string | null;
        total_count: number;
      }>
    >(supabase, 'get_form_response_page', {
      p_form_id: form.id,
      p_query: options.query ?? null,
      p_page_size: pageSize,
      p_page: page,
    }),
    runUntypedRpc<Array<{ response_id: string }>>(
      supabase,
      'get_form_matched_response_ids',
      {
        p_form_id: form.id,
        p_query: options.query ?? null,
      }
    ),
  ]);

  const pagedResponses = responsePage ?? [];
  const matchedResponseIds = (matchedResponseIdsResult ?? []).flatMap((item) =>
    typeof item.response_id === 'string' ? [item.response_id] : []
  );
  const [matchedResponses, answerRows] = await Promise.all([
    fetchResponseMetadataByIds(supabase, matchedResponseIds),
    fetchResponseAnswersByIds(supabase, matchedResponseIds),
  ]);

  const answerMap = new Map<string, FormResponseAnswerRow[]>();
  for (const answer of answerRows) {
    const current = answerMap.get(answer.response_id) ?? [];
    current.push(answer);
    answerMap.set(answer.response_id, current);
  }

  const resolveStoredQuestion = createStoredAnswerQuestionResolver(form);
  const records = pagedResponses.map((response) => ({
    id: response.id,
    sessionId: response.session_id,
    createdAt: response.created_at,
    submittedAt: response.submitted_at,
    respondentEmail: response.respondent_email,
    respondentUserId: response.respondent_user_id,
    answers: Object.fromEntries(
      (answerMap.get(response.id) ?? []).map((answer) => {
        const question = resolveStoredQuestion(answer);
        const rawValue = extractStoredAnswerValue(answer);
        const formatted = formatAnswerForQuestion(question, rawValue);

        return [
          normalizeMarkdownToText(question?.title || answer.question_title) ||
            'Untitled question',
          formatted,
        ];
      })
    ),
  }));
  const total = matchedResponseIds.length;

  return {
    total,
    records,
    summary: buildResponseSummary(matchedResponses),
    questionAnalytics: buildQuestionAnalytics(form, answerRows),
  };
}

export async function getReadOnlyAnswersForResponder(
  supabase: SupabaseClient<Database>,
  form: FormDefinition,
  options: {
    formId: string;
    respondentUserId: string;
  }
): Promise<FormReadOnlyAnswers> {
  const formsClient = getPrivateFormsClient(supabase);
  const { data: response } = await formsClient
    .from('form_responses')
    .select('id, session_id, submitted_at')
    .eq('form_id', options.formId)
    .eq('respondent_user_id', options.respondentUserId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!response) {
    return {
      answers: {},
      issues: [],
      submittedAt: null,
      responseId: null,
      sessionId: null,
    };
  }

  const { data: answerRows } = await formsClient
    .from('form_response_answers')
    .select('*')
    .eq('response_id', response.id);

  const resolveStoredQuestion = createStoredAnswerQuestionResolver(form);

  const responseAnswerRows = (answerRows ?? []) as FormResponseAnswerRow[];

  return responseAnswerRows.reduce<FormReadOnlyAnswers>(
    (accumulator, answer) => {
      const question = resolveStoredQuestion(answer);
      const rawValue = extractStoredAnswerValue(answer);

      if (!question) {
        accumulator.issues.push({
          questionId: answer.question_id,
          questionTitle:
            normalizeMarkdownToText(answer.question_title) ||
            'Untitled question',
          originalAnswer: formatAnswerForDisplay(answer),
        });
        return accumulator;
      }

      const restored = restoreAnswerForQuestion(question, rawValue);
      if (restored.value !== undefined) {
        accumulator.answers[question.id] = restored.value;
      }

      for (const unresolvedValue of restored.unresolvedValues) {
        accumulator.issues.push({
          questionId: question.id,
          questionTitle: normalizeMarkdownToText(question.title),
          originalAnswer: unresolvedValue,
        });
      }

      return accumulator;
    },
    {
      answers: {},
      issues: [],
      submittedAt: response.submitted_at,
      responseId: response.id,
      sessionId: response.session_id,
    }
  );
}

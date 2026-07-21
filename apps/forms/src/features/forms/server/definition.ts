import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import type {
  FormDefinition,
  FormLogicRuleRow,
  FormQuestionOptionRow,
  FormQuestionRow,
  FormRow,
  FormSectionRow,
  FormShareLinkRow,
} from '../types';
import { getPrivateFormsClient } from './client';
import {
  DEFAULT_FORM_MEDIA,
  resolveFormDefinitionMedia,
  sanitizeFormMediaForStorage,
} from './media';
import {
  parseFormSettings,
  parseFormTheme,
  parseQuestionSettings,
} from './parsers';

export function buildFormDefinition({
  form,
  sections,
  questions,
  options,
  logicRules,
  shareLink,
}: {
  form: FormRow;
  sections: FormSectionRow[];
  questions: FormQuestionRow[];
  options: FormQuestionOptionRow[];
  logicRules: FormLogicRuleRow[];
  shareLink?: FormShareLinkRow | null;
}): FormDefinition {
  const parsedTheme = parseFormTheme(form.theme);
  const optionsByQuestion = new Map<string, FormQuestionOptionRow[]>();

  for (const option of options) {
    const questionOptions = optionsByQuestion.get(option.question_id) ?? [];
    questionOptions.push(option);
    optionsByQuestion.set(option.question_id, questionOptions);
  }

  const questionsBySection = new Map<string, FormQuestionRow[]>();

  for (const question of questions) {
    const sectionQuestions = questionsBySection.get(question.section_id) ?? [];
    sectionQuestions.push(question);
    questionsBySection.set(question.section_id, sectionQuestions);
  }

  return {
    id: form.id,
    wsId: form.ws_id,
    creatorId: form.creator_id,
    title: form.title,
    description: form.description ?? '',
    status: form.status as FormDefinition['status'],
    accessMode: form.access_mode as FormDefinition['accessMode'],
    openAt: form.open_at,
    closeAt: form.close_at,
    maxResponses: form.max_responses,
    createdAt: form.created_at,
    updatedAt: form.updated_at,
    shareCode: shareLink?.code ?? null,
    theme: parsedTheme,
    settings: parseFormSettings(form.settings),
    sections: sections
      .sort((left, right) => left.position - right.position)
      .map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description ?? '',
        image: parsedTheme.sectionImages[section.id] ?? DEFAULT_FORM_MEDIA,
        questions: (questionsBySection.get(section.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .map((question) => ({
            id: question.id,
            sectionId: question.section_id,
            type: question.type as FormDefinition['sections'][number]['questions'][number]['type'],
            title: question.title,
            description: question.description ?? '',
            required: question.required,
            image: question.image
              ? sanitizeFormMediaForStorage(
                  question.image as {
                    storagePath?: string | null;
                    url?: string | null;
                    alt?: string | null;
                  }
                )
              : DEFAULT_FORM_MEDIA,
            settings: parseQuestionSettings(question.settings),
            options: (optionsByQuestion.get(question.id) ?? [])
              .sort((left, right) => left.position - right.position)
              .map((option) => ({
                id: option.id,
                label: option.label,
                value: option.value,
                image: option.image
                  ? sanitizeFormMediaForStorage(
                      option.image as {
                        storagePath?: string | null;
                        url?: string | null;
                        alt?: string | null;
                      }
                    )
                  : DEFAULT_FORM_MEDIA,
              })),
          })),
      })),
    logicRules: logicRules
      .sort((left, right) => left.priority - right.priority)
      .map((rule) => {
        const triggerType =
          (rule.trigger_type as FormDefinition['logicRules'][number]['triggerType']) ??
          'question';
        const sourceSectionId = rule.source_section_id ?? null;
        const sourceQuestionId = rule.source_question_id ?? null;

        return {
          id: rule.id,
          triggerType,
          sourceSectionId,
          sourceQuestionId,
          operator:
            rule.operator as FormDefinition['logicRules'][number]['operator'],
          comparisonValue: rule.comparison_value ?? '',
          actionType:
            rule.action_type as FormDefinition['logicRules'][number]['actionType'],
          targetSectionId: rule.target_section_id,
        };
      }),
  };
}

async function fetchFormQuestionOptions(
  supabase: SupabaseClient<Database>,
  questionIds: string[]
): Promise<FormQuestionOptionRow[]> {
  const formsClient = getPrivateFormsClient(supabase);
  const options: FormQuestionOptionRow[] = [];

  for (let index = 0; index < questionIds.length; index += 500) {
    const chunk = questionIds.slice(index, index + 500);

    if (!chunk.length) {
      continue;
    }

    const { data } = await formsClient
      .from('form_question_options')
      .select('id, question_id, label, value, image, position')
      .in('question_id', chunk);

    options.push(...(data ?? []));
  }

  return options;
}

export async function fetchFormDefinition(
  supabase: SupabaseClient<Database>,
  formId: string
): Promise<FormDefinition | null> {
  const formsClient = getPrivateFormsClient(supabase);
  const { data: form } = await formsClient
    .from('forms')
    .select('*')
    .eq('id', formId)
    .maybeSingle();

  if (!form) {
    return null;
  }

  const [
    { data: sections },
    { data: questions },
    { data: logicRules },
    { data: shareLink },
  ] = await Promise.all([
    formsClient.from('form_sections').select('*').eq('form_id', formId),
    formsClient.from('form_questions').select('*').eq('form_id', formId),
    formsClient.from('form_logic_rules').select('*').eq('form_id', formId),
    formsClient
      .from('form_share_links')
      .select('*')
      .eq('form_id', formId)
      .maybeSingle(),
  ]);

  const formRow = form as FormRow;
  const sectionRows = (sections ?? []) as FormSectionRow[];
  const questionRows = (questions ?? []) as FormQuestionRow[];
  const logicRuleRows = (logicRules ?? []) as FormLogicRuleRow[];
  const shareLinkRow = shareLink as FormShareLinkRow | null;
  const questionIds = questionRows.map((question) => question.id);
  const filteredOptions = await fetchFormQuestionOptions(supabase, questionIds);

  const definition = buildFormDefinition({
    form: formRow,
    sections: sectionRows,
    questions: questionRows,
    options: filteredOptions,
    logicRules: logicRuleRows,
    shareLink: shareLinkRow,
  });

  return resolveFormDefinitionMedia(supabase, definition);
}

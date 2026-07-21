import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import type { FormStudioInput } from '../schema';
import type { FormRow } from '../types';
import { getPrivateFormsClient } from './client';
import {
  type DEFAULT_FORM_MEDIA,
  hasFormMedia,
  sanitizeFormMediaForStorage,
} from './media';
import { createClientUuid } from './parsers';

function buildFormTimestamps(existing: FormRow | null, input: FormStudioInput) {
  const now = new Date().toISOString();
  const publishedAt =
    input.status === 'published'
      ? (existing?.published_at ?? now)
      : (existing?.published_at ?? null);
  const closedAt = input.status === 'closed' ? now : null;

  return { publishedAt, closedAt };
}

export async function saveFormDefinition({
  supabase,
  wsId,
  creatorId,
  formId,
  input,
}: {
  supabase: SupabaseClient<Database>;
  wsId: string;
  creatorId: string;
  formId?: string;
  input: FormStudioInput;
}): Promise<string> {
  const formsClient = getPrivateFormsClient(supabase);
  const existing = formId
    ? await formsClient.from('forms').select('*').eq('id', formId).maybeSingle()
    : { data: null };
  const resolvedFormId = formId ?? createClientUuid();
  const timestamps = buildFormTimestamps(existing.data, input);

  const upsertPayload = {
    id: resolvedFormId,
    ws_id: wsId,
    creator_id: existing.data?.creator_id ?? creatorId,
    title: input.title,
    description: input.description,
    status: input.status,
    access_mode: input.accessMode,
    open_at: input.openAt ?? null,
    close_at: input.closeAt ?? null,
    max_responses: input.maxResponses ?? null,
    theme: {
      ...input.theme,
      coverImage: sanitizeFormMediaForStorage(input.theme.coverImage),
      sectionImages: input.sections.reduce<
        Record<string, typeof DEFAULT_FORM_MEDIA>
      >((accumulator, section, index) => {
        const key = section.id ?? `section:${index}`;
        const media = sanitizeFormMediaForStorage(section.image);

        if (hasFormMedia(media)) {
          accumulator[key] = media;
        }

        return accumulator;
      }, {}),
    },
    settings: {
      ...input.settings,
      requireTurnstile: true,
    },
    published_at: timestamps.publishedAt,
    closed_at: timestamps.closedAt,
  };

  const { error: formError } = await formsClient
    .from('forms')
    .upsert(upsertPayload);

  if (formError) {
    throw new Error(formError.message);
  }

  await formsClient
    .from('form_logic_rules')
    .delete()
    .eq('form_id', resolvedFormId);

  const sectionIdMap = new Map<string, string>();
  const questionIdMap = new Map<string, string>();

  const sections = input.sections.map((section, index) => {
    const id = section.id ?? createClientUuid();
    sectionIdMap.set(section.id ?? `section:${index}`, id);

    return {
      id,
      form_id: resolvedFormId,
      title: section.title,
      description: section.description,
      position: index,
    };
  });

  const questions = input.sections.flatMap((section, sectionIndex) =>
    section.questions.map((question, questionIndex) => {
      const id = question.id ?? createClientUuid();
      const sectionKey = section.id ?? `section:${sectionIndex}`;
      questionIdMap.set(
        question.id ?? `question:${sectionIndex}:${questionIndex}`,
        id
      );

      const sectionId = sectionIdMap.get(sectionKey);

      if (!sectionId) {
        throw new Error(`Missing section ID mapping for ${sectionKey}`);
      }

      return {
        id,
        form_id: resolvedFormId,
        section_id: sectionId,
        type: question.type,
        title: question.title,
        description: question.description,
        required: question.required,
        position: questionIndex,
        image: sanitizeFormMediaForStorage(question.image),
        settings: question.settings,
      };
    })
  );

  await formsClient
    .from('form_questions')
    .delete()
    .eq('form_id', resolvedFormId);
  await formsClient
    .from('form_sections')
    .delete()
    .eq('form_id', resolvedFormId);

  const { error: sectionError } = await formsClient
    .from('form_sections')
    .insert(sections);
  if (sectionError) {
    throw new Error(sectionError.message);
  }

  if (questions.length > 0) {
    const { error: questionError } = await formsClient
      .from('form_questions')
      .insert(questions);
    if (questionError) {
      throw new Error(questionError.message);
    }
  }

  const options = input.sections.flatMap((section, sectionIndex) =>
    section.questions.flatMap((question, questionIndex) => {
      const questionId =
        questionIdMap.get(
          question.id ?? `question:${sectionIndex}:${questionIndex}`
        ) ?? null;

      return questionId
        ? question.options.map((option, optionIndex) => ({
            id: option.id ?? createClientUuid(),
            question_id: questionId,
            label: option.label,
            value: option.value,
            image: sanitizeFormMediaForStorage(option.image),
            position: optionIndex,
          }))
        : [];
    })
  );

  if (options.length > 0) {
    const { error: optionError } = await formsClient
      .from('form_question_options')
      .insert(options);
    if (optionError) {
      throw new Error(optionError.message);
    }
  }

  const logicRules = input.logicRules.map((rule, index) => {
    const triggerType = rule.triggerType ?? 'question';
    const sourceQuestionId = rule.sourceQuestionId?.trim()
      ? (questionIdMap.get(rule.sourceQuestionId) ?? rule.sourceQuestionId)
      : null;
    const sourceSectionId = rule.sourceSectionId?.trim()
      ? (sectionIdMap.get(rule.sourceSectionId) ?? rule.sourceSectionId)
      : null;

    let resolvedSourceSectionId = sourceSectionId;
    if (triggerType === 'question' && rule.sourceQuestionId?.trim()) {
      const sectionForQuestion = input.sections.find((s) =>
        s.questions.some(
          (q) => (q.id ?? '').trim() === (rule.sourceQuestionId ?? '').trim()
        )
      );
      if (sectionForQuestion?.id) {
        resolvedSourceSectionId =
          sectionIdMap.get(sectionForQuestion.id) ?? sectionForQuestion.id;
      }
    }

    return {
      id: rule.id ?? createClientUuid(),
      form_id: resolvedFormId,
      trigger_type: triggerType,
      source_question_id: sourceQuestionId,
      source_section_id: resolvedSourceSectionId ?? sourceSectionId,
      operator: rule.operator,
      comparison_value: rule.comparisonValue ?? '',
      action_type: rule.actionType,
      target_section_id:
        rule.targetSectionId == null
          ? null
          : (sectionIdMap.get(rule.targetSectionId) ?? rule.targetSectionId),
      priority: index,
    };
  });

  if (logicRules.length > 0) {
    const { error: logicError } = await formsClient
      .from('form_logic_rules')
      .insert(logicRules);
    if (logicError) {
      throw new Error(logicError.message);
    }
  }

  return resolvedFormId;
}

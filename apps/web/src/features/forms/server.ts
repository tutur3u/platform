import crypto from 'node:crypto';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import {
  createStoredAnswerQuestionResolver,
  formatAnswerForQuestion,
  restoreAnswerForQuestion,
} from './answer-utils';
import { normalizeMarkdownToText } from './content';
import {
  buildQuestionAnalytics,
  buildResponseSummary,
} from './response-analytics';
import {
  createDefaultFormStudioInput,
  type FormStudioInput,
  formQuestionSettingsSchema,
  formSettingsSchema,
  formThemeSchema,
} from './schema';
import type {
  FormAnalytics,
  FormAnswerValue,
  FormDefinition,
  FormListItem,
  FormQuestionOptionRow,
  FormQuestionRow,
  FormReadOnlyAnswers,
  FormResponseAnswerRow,
  FormResponseRecord,
  FormResponseRow,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
  FormRow,
  FormSectionRow,
  FormShareLinkRow,
} from './types';
import { validateSubmittedAnswers } from './validation';

const DEFAULT_FORM_MEDIA = createDefaultFormStudioInput().theme.coverImage;

export function generateFormShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';

  for (let index = 0; index < 12; index += 1) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }

  return code;
}

export function createClientUuid(): string {
  return crypto.randomUUID();
}

export function parseFormTheme(theme: FormRow['theme']) {
  const result = formThemeSchema.safeParse({
    ...createDefaultFormStudioInput().theme,
    ...(theme && typeof theme === 'object' ? theme : {}),
  });

  return result.success ? result.data : createDefaultFormStudioInput().theme;
}

export function parseFormSettings(settings: FormRow['settings']) {
  const result = formSettingsSchema.safeParse({
    ...createDefaultFormStudioInput().settings,
    ...(settings && typeof settings === 'object' ? settings : {}),
  });

  return result.success ? result.data : createDefaultFormStudioInput().settings;
}

export function parseQuestionSettings(settings: FormQuestionRow['settings']) {
  const result = formQuestionSettingsSchema.safeParse(
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings
      : {}
  );

  return result.success ? result.data : {};
}

function hasFormMedia(media: {
  storagePath?: string | null;
  url?: string | null;
}) {
  return Boolean(media.storagePath || media.url);
}

function sanitizeFormMediaForStorage(
  media:
    | {
        storagePath?: string | null;
        url?: string | null;
        alt?: string | null;
      }
    | undefined
): {
  storagePath: string;
  url: string;
  alt: string;
} {
  return {
    storagePath: media?.storagePath ?? '',
    url: media?.storagePath ? '' : (media?.url ?? ''),
    alt: media?.alt ?? '',
  };
}

async function resolveFormMedia(
  supabase: SupabaseClient<Database>,
  media:
    | {
        storagePath?: string | null;
        url?: string | null;
        alt?: string | null;
      }
    | undefined
): Promise<{
  storagePath: string;
  url: string;
  alt: string;
}> {
  const normalized = {
    storagePath: media?.storagePath ?? DEFAULT_FORM_MEDIA.storagePath,
    url: media?.url ?? DEFAULT_FORM_MEDIA.url,
    alt: media?.alt ?? DEFAULT_FORM_MEDIA.alt,
  };

  if (!normalized.storagePath) {
    return normalized;
  }

  const { data, error } = await supabase.storage
    .from('workspaces')
    .createSignedUrl(normalized.storagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    return normalized;
  }

  return {
    ...normalized,
    url: data.signedUrl,
  };
}

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
  logicRules: Database['public']['Tables']['form_logic_rules']['Row'][];
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

async function resolveFormDefinitionMedia(
  supabase: SupabaseClient<Database>,
  definition: FormDefinition
) {
  const coverImage = await resolveFormMedia(
    supabase,
    definition.theme.coverImage
  );
  const sectionMediaEntries = await Promise.all(
    definition.sections.map(async (section) => [
      section.id,
      await resolveFormMedia(supabase, section.image),
    ])
  );
  const optionMediaEntries = await Promise.all(
    definition.sections.flatMap((section) =>
      section.questions.flatMap((question) =>
        question.options.map(
          async (option) =>
            [option.id, await resolveFormMedia(supabase, option.image)] as const
        )
      )
    )
  );
  const questionMediaEntries = await Promise.all(
    definition.sections.flatMap((section) =>
      section.questions.map(
        async (question) =>
          [
            question.id,
            await resolveFormMedia(supabase, question.image),
          ] as const
      )
    )
  );
  const resolvedSectionImages: FormDefinition['theme']['sectionImages'] =
    Object.fromEntries(sectionMediaEntries);
  const resolvedOptionImages = new Map(optionMediaEntries);
  const resolvedQuestionImages = new Map(questionMediaEntries);

  return {
    ...definition,
    theme: {
      ...definition.theme,
      coverImage,
      sectionImages: resolvedSectionImages,
    },
    sections: definition.sections.map((section) => ({
      ...section,
      image: resolvedSectionImages[section.id] ?? DEFAULT_FORM_MEDIA,
      questions: section.questions.map((question) => ({
        ...question,
        image: resolvedQuestionImages.get(question.id) ?? DEFAULT_FORM_MEDIA,
        options: question.options.map((option) => ({
          ...option,
          image: resolvedOptionImages.get(option.id) ?? DEFAULT_FORM_MEDIA,
        })),
      })),
    })),
  };
}

async function fetchFormQuestionOptions(
  supabase: SupabaseClient<Database>,
  questionIds: string[]
): Promise<FormQuestionOptionRow[]> {
  const options: FormQuestionOptionRow[] = [];

  for (let index = 0; index < questionIds.length; index += 500) {
    const chunk = questionIds.slice(index, index + 500);

    if (!chunk.length) {
      continue;
    }

    const { data } = await supabase
      .from('form_question_options')
      .select('id, question_id, label, value, image, position')
      .in('question_id', chunk);

    options.push(...(data ?? []));
  }

  return options;
}

async function fetchResponseAnswersByIds(
  supabase: SupabaseClient<Database>,
  responseIds: string[]
): Promise<FormResponseAnswerRow[]> {
  const answers: FormResponseAnswerRow[] = [];

  for (let index = 0; index < responseIds.length; index += 500) {
    const chunk = responseIds.slice(index, index + 500);

    if (!chunk.length) {
      continue;
    }

    const { data } = await supabase
      .from('form_response_answers')
      .select('*')
      .in('response_id', chunk);

    answers.push(...(data ?? []));
  }

  return answers;
}

export async function fetchFormDefinition(
  supabase: SupabaseClient<Database>,
  formId: string
): Promise<FormDefinition | null> {
  const { data: form } = await supabase
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
    supabase.from('form_sections').select('*').eq('form_id', formId),
    supabase.from('form_questions').select('*').eq('form_id', formId),
    supabase.from('form_logic_rules').select('*').eq('form_id', formId),
    supabase
      .from('form_share_links')
      .select('*')
      .eq('form_id', formId)
      .maybeSingle(),
  ]);

  const questionIds = (questions ?? []).map((question) => question.id);
  const filteredOptions = await fetchFormQuestionOptions(supabase, questionIds);

  const definition = buildFormDefinition({
    form,
    sections: sections ?? [],
    questions: questions ?? [],
    options: filteredOptions,
    logicRules: logicRules ?? [],
    shareLink,
  });

  return resolveFormDefinitionMedia(supabase, definition);
}

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
  const existing = formId
    ? await supabase.from('forms').select('*').eq('id', formId).maybeSingle()
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

  const { error: formError } = await supabase
    .from('forms')
    .upsert(upsertPayload);

  if (formError) {
    throw new Error(formError.message);
  }

  await supabase
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

  await supabase.from('form_questions').delete().eq('form_id', resolvedFormId);
  await supabase.from('form_sections').delete().eq('form_id', resolvedFormId);

  const { error: sectionError } = await supabase
    .from('form_sections')
    .insert(sections);
  if (sectionError) {
    throw new Error(sectionError.message);
  }

  if (questions.length > 0) {
    const { error: questionError } = await supabase
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
    const { error: optionError } = await supabase
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
    const { error: logicError } = await supabase
      .from('form_logic_rules')
      .insert(logicRules);
    if (logicError) {
      throw new Error(logicError.message);
    }
  }

  return resolvedFormId;
}

export async function listForms(
  supabase: SupabaseClient<Database>,
  wsId: string,
  workspaceSlug: string,
  query?: string
): Promise<FormListItem[]> {
  let formsQuery = supabase
    .from('forms')
    .select('*')
    .eq('ws_id', wsId)
    .order('updated_at', { ascending: false });

  if (query) {
    formsQuery = formsQuery.ilike('title', `%${query}%`);
  }

  const { data: forms } = await formsQuery;
  const formIds = (forms ?? []).map((form) => form.id);

  if (formIds.length === 0) {
    return [];
  }

  const [{ data: sessions }, { data: responses }] = await Promise.all([
    supabase
      .from('form_sessions')
      .select('form_id, started_at, submitted_at')
      .in('form_id', formIds),
    supabase.from('form_responses').select('form_id').in('form_id', formIds),
  ]);

  return (forms ?? []).map((form) => {
    const formSessions = (sessions ?? []).filter(
      (session) => session.form_id === form.id
    );
    const formResponses = (responses ?? []).filter(
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

export function getSessionMetadata(request: Pick<Request, 'headers'>) {
  const userAgent = request.headers.get('user-agent') ?? '';
  const referrer = request.headers.get('referer');
  let referrerDomain: string | null = null;
  if (referrer) {
    try {
      referrerDomain = new URL(referrer).hostname;
    } catch {
      referrerDomain = null;
    }
  }
  const browser = userAgent.includes('Chrome')
    ? 'Chrome'
    : userAgent.includes('Safari')
      ? 'Safari'
      : userAgent.includes('Firefox')
        ? 'Firefox'
        : 'Other';
  const os = userAgent.includes('Mac')
    ? 'macOS'
    : userAgent.includes('Windows')
      ? 'Windows'
      : userAgent.includes('Android')
        ? 'Android'
        : userAgent.includes('iPhone') || userAgent.includes('iPad')
          ? 'iOS'
          : 'Other';
  const deviceType = /Mobi|Android|iPhone|iPad/i.test(userAgent)
    ? 'mobile'
    : 'desktop';

  return {
    referrerDomain,
    browser,
    os,
    deviceType,
    country: request.headers.get('x-vercel-ip-country'),
    city: request.headers.get('x-vercel-ip-city'),
  };
}

export function serializeAnswerForStorage(answer: unknown) {
  if (typeof answer === 'string') {
    return {
      answer_text: answer,
      answer_json: null,
    };
  }

  if (typeof answer === 'number') {
    return {
      answer_text: String(answer),
      answer_json: answer,
    };
  }

  if (Array.isArray(answer)) {
    return {
      answer_text: null,
      answer_json: answer,
    };
  }

  return {
    answer_text: null,
    answer_json: null,
  };
}

export function formatAnswerForDisplay(answer: FormResponseAnswerRow) {
  if (typeof answer.answer_text === 'string' && answer.answer_text.trim()) {
    return answer.answer_text;
  }

  if (Array.isArray(answer.answer_json)) {
    return answer.answer_json.join(', ');
  }

  if (typeof answer.answer_json === 'number') {
    return String(answer.answer_json);
  }

  return '—';
}

function extractStoredAnswerValue(
  answer: Pick<FormResponseAnswerRow, 'answer_text' | 'answer_json'>
): FormAnswerValue | null {
  if (typeof answer.answer_text === 'string' && answer.answer_text.trim()) {
    return answer.answer_text;
  }

  if (Array.isArray(answer.answer_json)) {
    return answer.answer_json.filter(
      (entry): entry is string => typeof entry === 'string'
    );
  }

  if (typeof answer.answer_json === 'number') {
    return answer.answer_json;
  }

  return null;
}

const EMPTY_FORM_ANALYTICS: FormAnalytics = {
  totalViews: 0,
  totalStarts: 0,
  totalSubmissions: 0,
  totalAbandons: 0,
  startRate: 0,
  completionRate: 0,
  completionFromStartsRate: 0,
  avgCompletionSeconds: 0,
  uniqueReferrers: 0,
  uniqueCountries: 0,
  responderModeBreakdown: [],
  topReferrers: [],
  devices: [],
  browsers: [],
  operatingSystems: [],
  countries: [],
  cities: [],
  dropoffBySection: [],
  dropoffByQuestion: [],
  activity: [],
};

function toNumber(value: unknown): number {
  return typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value) || 0
      : 0;
}

function parseLabelValueList(
  value: unknown
): Array<{ label: string; value: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const label = 'label' in item ? item.label : '';
    return typeof label === 'string'
      ? [
          {
            label,
            value: toNumber('value' in item ? item.value : 0),
          },
        ]
      : [];
  });
}

function parseFormAnalytics(value: unknown): FormAnalytics {
  if (!value || typeof value !== 'object') {
    return EMPTY_FORM_ANALYTICS;
  }

  const rawDropoffBySection =
    'dropoffBySection' in value ? value.dropoffBySection : [];
  const rawDropoffByQuestion =
    'dropoffByQuestion' in value ? value.dropoffByQuestion : [];
  const rawActivity = 'activity' in value ? value.activity : [];

  return {
    totalViews: toNumber('totalViews' in value ? value.totalViews : 0),
    totalStarts: toNumber('totalStarts' in value ? value.totalStarts : 0),
    totalSubmissions: toNumber(
      'totalSubmissions' in value ? value.totalSubmissions : 0
    ),
    totalAbandons: toNumber('totalAbandons' in value ? value.totalAbandons : 0),
    startRate: toNumber('startRate' in value ? value.startRate : 0),
    completionRate: toNumber(
      'completionRate' in value ? value.completionRate : 0
    ),
    completionFromStartsRate: toNumber(
      'completionFromStartsRate' in value ? value.completionFromStartsRate : 0
    ),
    avgCompletionSeconds: toNumber(
      'avgCompletionSeconds' in value ? value.avgCompletionSeconds : 0
    ),
    uniqueReferrers: toNumber(
      'uniqueReferrers' in value ? value.uniqueReferrers : 0
    ),
    uniqueCountries: toNumber(
      'uniqueCountries' in value ? value.uniqueCountries : 0
    ),
    responderModeBreakdown: parseLabelValueList(
      'responderModeBreakdown' in value ? value.responderModeBreakdown : []
    ),
    topReferrers: parseLabelValueList(
      'topReferrers' in value ? value.topReferrers : []
    ),
    devices: parseLabelValueList('devices' in value ? value.devices : []),
    browsers: parseLabelValueList('browsers' in value ? value.browsers : []),
    operatingSystems: parseLabelValueList(
      'operatingSystems' in value ? value.operatingSystems : []
    ),
    countries: parseLabelValueList('countries' in value ? value.countries : []),
    cities: parseLabelValueList('cities' in value ? value.cities : []),
    dropoffBySection: Array.isArray(rawDropoffBySection)
      ? rawDropoffBySection.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }

          const sectionId = 'sectionId' in entry ? entry.sectionId : '';
          const title = 'title' in entry ? entry.title : '';
          if (typeof sectionId !== 'string' || typeof title !== 'string') {
            return [];
          }

          return [
            {
              sectionId,
              title,
              count: toNumber('count' in entry ? entry.count : 0),
            },
          ];
        })
      : [],
    dropoffByQuestion: Array.isArray(rawDropoffByQuestion)
      ? rawDropoffByQuestion.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }

          const questionId = 'questionId' in entry ? entry.questionId : '';
          const title = 'title' in entry ? entry.title : '';
          if (typeof questionId !== 'string' || typeof title !== 'string') {
            return [];
          }

          return [
            {
              questionId,
              title,
              count: toNumber('count' in entry ? entry.count : 0),
            },
          ];
        })
      : [],
    activity: Array.isArray(rawActivity)
      ? rawActivity.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }

          const date = 'date' in entry ? entry.date : '';
          if (typeof date !== 'string') {
            return [];
          }

          return [
            {
              date,
              views: toNumber('views' in entry ? entry.views : 0),
              starts: toNumber('starts' in entry ? entry.starts : 0),
              submissions: toNumber(
                'submissions' in entry ? entry.submissions : 0
              ),
            },
          ];
        })
      : [],
  };
}

async function runUntypedRpc<T>(
  supabase: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>
): Promise<T | null> {
  const rpcClient = supabase as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>
    ) => Promise<{ data: T | null; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc(fn, args);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function fetchResponseMetadataByIds(
  supabase: SupabaseClient<Database>,
  responseIds: string[]
): Promise<
  Array<Pick<FormResponseRow, 'id' | 'respondent_email' | 'respondent_user_id'>>
> {
  const responses: Array<
    Pick<FormResponseRow, 'id' | 'respondent_email' | 'respondent_user_id'>
  > = [];

  for (let index = 0; index < responseIds.length; index += 500) {
    const chunk = responseIds.slice(index, index + 500);

    if (!chunk.length) {
      continue;
    }

    const { data } = await supabase
      .from('form_responses')
      .select('id, respondent_email, respondent_user_id')
      .in('id', chunk);

    responses.push(...(data ?? []));
  }

  return responses;
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
  const { data: response } = await supabase
    .from('form_responses')
    .select('id, submitted_at')
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
    };
  }

  const { data: answerRows } = await supabase
    .from('form_response_answers')
    .select('*')
    .eq('response_id', response.id);

  const resolveStoredQuestion = createStoredAnswerQuestionResolver(form);

  return (answerRows ?? []).reduce<FormReadOnlyAnswers>(
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
    }
  );
}

export async function getFormAnalytics(
  supabase: SupabaseClient<Database>,
  form: FormDefinition
): Promise<FormAnalytics> {
  const analytics = await runUntypedRpc<unknown>(
    supabase,
    'get_form_analytics_overview',
    {
      p_form_id: form.id,
    }
  );

  return parseFormAnalytics(analytics);
}

export { validateSubmittedAnswers };

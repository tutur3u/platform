import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MeetCallAccessError } from '../../lib/call-access';
import {
  buildFormDefinition,
  formLogicRuleSchema,
  formOptionSchema,
  formQuestionSchema,
  formSectionSchema,
  formStudioSchema,
  hasFormMedia,
  sanitizeFormMediaForStorage,
  type FormDefinition,
  type FormRow,
  type FormStudioInput,
} from './forms-source';
import type { FormAdmin } from './policy';

const uuid = z.guid();
const sectionSchema = formSectionSchema.extend({
  id: uuid,
  questions: z.array(
    formQuestionSchema.extend({
      id: uuid,
      sectionId: uuid,
      options: z.array(formOptionSchema.extend({ id: uuid })),
    })
  ),
});
const definitionSchema = formStudioSchema.extend({
  id: uuid,
  wsId: uuid,
  creatorId: uuid,
  createdAt: z.string(),
  updatedAt: z.string(),
  sections: z.array(sectionSchema),
  logicRules: z.array(formLogicRuleSchema.and(z.object({ id: uuid }))),
});
export const meetFormLaunchSchema = z.strictObject({
  launchId: z.uuid(),
  formId: uuid,
  versionId: z.uuid(),
  form: definitionSchema,
});

export const MAX_FORM_BODY_BYTES = 48 * 1024;

export async function loadFormSnapshot(db: FormAdmin, form: FormRow) {
  const forms = db.schema('private');
  const scopedFormId = form.id;
  const [sections, questions, logicRules] = await Promise.all([
    forms
      .from('form_sections')
      .select('*')
      .eq('form_id', scopedFormId)
      .limit(41),
    forms
      .from('form_questions')
      .select('*')
      .eq('form_id', scopedFormId)
      .limit(121),
    forms
      .from('form_logic_rules')
      .select('*')
      .eq('form_id', scopedFormId)
      .limit(121),
  ]);
  if (sections.error || questions.error || logicRules.error)
    throw new MeetCallAccessError(503, 'Form definition unavailable');
  if (
    sections.data.length > 40 ||
    questions.data.length > 120 ||
    logicRules.data.length > 120
  ) {
    throw new MeetCallAccessError(413, 'Form is too large for Meet');
  }
  if (!questions.data.length || !sections.data.length)
    throw new MeetCallAccessError(
      400,
      'A launched form needs at least one question'
    );
  const options = await forms
    .from('form_question_options')
    .select('*')
    .in(
      'question_id',
      questions.data.map(({ id }) => id)
    )
    .limit(501);
  if (options.error)
    throw new MeetCallAccessError(503, 'Form options unavailable');
  if (options.data.length > 500)
    throw new MeetCallAccessError(413, 'Form is too large for Meet');
  const definition = buildFormDefinition({
    form,
    sections: sections.data,
    questions: questions.data,
    options: options.data,
    logicRules: logicRules.data,
  });
  return definitionSchema.parse(definition);
}

export function formVersionId(form: FormDefinition) {
  const hex = createHash('sha256').update(JSON.stringify(form)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Inline identifiers are local references. Only server-generated IDs reach Forms. */
export function prepareInlineDefinition(
  input: FormStudioInput,
  identity: Pick<FormDefinition, 'id' | 'wsId' | 'creatorId' | 'createdAt'>
) {
  const sections = new Map<string, string>();
  const questions = new Map<string, string>();
  const register = (map: Map<string, string>, key?: string) => {
    const id = crypto.randomUUID();
    if (key) {
      if (map.has(key))
        throw new MeetCallAccessError(400, 'Duplicate form identifier');
      map.set(key, id);
    }
    return id;
  };
  const resolve = (map: Map<string, string>, key?: string | null) => {
    if (!key) return null;
    const id = map.get(key);
    if (!id) throw new MeetCallAccessError(400, 'Invalid form branch');
    return id;
  };
  const sanitizeMedia = (
    media: Parameters<typeof sanitizeFormMediaForStorage>[0]
  ) => sanitizeFormMediaForStorage(media, identity.wsId);
  const questionSections = new Map<string, string>();
  const remappedSections = input.sections.map((section) => {
    const sectionId = register(sections, section.id);
    return {
      ...section,
      id: sectionId,
      image: sanitizeMedia(section.image),
      questions: section.questions.map((question) => {
        const id = register(questions, question.id);
        questionSections.set(id, sectionId);
        return {
          ...question,
          id,
          sectionId,
          image: sanitizeMedia(question.image),
          options: question.options.map((option) => ({
            ...option,
            id: crypto.randomUUID(),
            image: sanitizeMedia(option.image),
          })),
        };
      }),
    };
  });
  const allQuestions = remappedSections.flatMap((section) => section.questions);
  if (allQuestions.length === 0)
    throw new MeetCallAccessError(
      400,
      'A launched form needs at least one question'
    );
  if (
    remappedSections.length > 40 ||
    allQuestions.length > 120 ||
    input.logicRules.length > 120 ||
    allQuestions.reduce(
      (count, question) => count + question.options.length,
      0
    ) > 500
  ) {
    throw new MeetCallAccessError(413, 'Form is too large for Meet');
  }
  return definitionSchema.parse({
    ...input,
    ...identity,
    updatedAt: identity.createdAt,
    status: 'published',
    theme: {
      ...input.theme,
      coverImage: sanitizeMedia(input.theme.coverImage),
      sectionImages: Object.fromEntries(
        remappedSections
          .filter((section) => hasFormMedia(section.image))
          .map((section) => [section.id, section.image])
      ),
    },
    seo: { ...input.seo, image: sanitizeMedia(input.seo.image) },
    settings: { ...input.settings, requireTurnstile: true },
    sections: remappedSections,
    logicRules: input.logicRules.map((rule) => {
      const sourceQuestionId = resolve(questions, rule.sourceQuestionId);
      return {
        ...rule,
        id: crypto.randomUUID(),
        sourceQuestionId,
        sourceSectionId: sourceQuestionId
          ? questionSections.get(sourceQuestionId)
          : resolve(sections, rule.sourceSectionId),
        targetSectionId: resolve(sections, rule.targetSectionId),
      };
    }),
  });
}

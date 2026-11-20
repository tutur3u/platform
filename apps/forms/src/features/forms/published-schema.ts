import { z } from 'zod';
import {
  formAnswerValueSchema,
  formLogicRuleSchema,
  formOptionSchema,
  formQuestionSchema,
  formSectionSchema,
  formStudioSchema,
} from './schema';

export const publishedFormIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

export const publishedFormScopeSchema = z.object({
  wsId: publishedFormIdSchema,
  formId: publishedFormIdSchema,
  versionId: publishedFormIdSchema,
});

export const publishedFormLaunchScopeSchema = publishedFormScopeSchema.extend({
  launchId: publishedFormIdSchema,
});

export const FORM_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const FORM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const FORM_UPLOAD_MAX_FILES = 5;

const matrixAxisSchema = z
  .array(
    z.object({
      id: publishedFormIdSchema,
      label: z.string().trim().min(1).max(240),
    })
  )
  .min(1)
  .max(20)
  .refine((axis) => new Set(axis.map(({ id }) => id)).size === axis.length);

const choiceOptionSchema = formOptionSchema.extend({
  id: publishedFormIdSchema,
});
const publishedQuestionBase = formQuestionSchema.extend({
  id: publishedFormIdSchema,
  sectionId: publishedFormIdSchema,
  options: z.array(choiceOptionSchema),
});

export const formMatrixQuestionSchema = publishedQuestionBase.extend({
  type: z.literal('matrix'),
  rows: matrixAxisSchema,
  columns: matrixAxisSchema,
});

export const formUploadQuestionSchema = publishedQuestionBase.extend({
  type: z.literal('file_upload'),
  maxFiles: z.number().int().min(1).max(FORM_UPLOAD_MAX_FILES).default(1),
  maxBytes: z
    .number()
    .int()
    .min(1)
    .max(FORM_UPLOAD_MAX_BYTES)
    .default(FORM_UPLOAD_MAX_BYTES),
  acceptedMimeTypes: z
    .array(z.enum(FORM_UPLOAD_MIME_TYPES))
    .min(1)
    .max(FORM_UPLOAD_MIME_TYPES.length)
    .default([...FORM_UPLOAD_MIME_TYPES]),
});

const publishedQuestionSchema = z.discriminatedUnion('type', [
  publishedQuestionBase,
  formMatrixQuestionSchema,
  formUploadQuestionSchema,
]);

export const formPublishedDefinitionSchema = formStudioSchema
  .omit({ seo: true })
  .extend({
    id: publishedFormIdSchema,
    wsId: publishedFormIdSchema,
    status: z.literal('published'),
    sections: z
      .array(
        formSectionSchema.extend({
          id: publishedFormIdSchema,
          questions: z.array(publishedQuestionSchema),
        })
      )
      .min(1),
    logicRules: z
      .array(formLogicRuleSchema.and(z.object({ id: publishedFormIdSchema })))
      .default([]),
  })
  .refine((form) => {
    const ids = new Set<string>();
    const extended = new Set<string>();
    for (const section of form.sections) {
      if (ids.has(section.id)) return false;
      ids.add(section.id);
      for (const question of section.questions) {
        if (question.sectionId !== section.id || ids.has(question.id))
          return false;
        ids.add(question.id);
        if (question.type === 'matrix' || question.type === 'file_upload') {
          extended.add(question.id);
        }
      }
    }
    return form.logicRules.every(
      ({ sourceQuestionId }) =>
        !sourceQuestionId || !extended.has(sourceQuestionId)
    );
  }, 'Invalid section or question binding');

export const formMatrixAnswerSchema = z.record(
  publishedFormIdSchema,
  publishedFormIdSchema
);

export const formUploadAnswerSchema = z
  .array(publishedFormIdSchema)
  .max(FORM_UPLOAD_MAX_FILES)
  .refine((ids) => new Set(ids).size === ids.length);

export const formPublishedAnswersSchema = z.record(
  publishedFormIdSchema,
  z.union([formAnswerValueSchema, formMatrixAnswerSchema])
);

export type PublishedFormDefinition = z.infer<
  typeof formPublishedDefinitionSchema
>;
export type PublishedFormQuestion =
  PublishedFormDefinition['sections'][number]['questions'][number];
export type PublishedFormAnswers = z.infer<typeof formPublishedAnswersSchema>;
export type PublishedFormLaunchScope = z.infer<
  typeof publishedFormLaunchScopeSchema
>;
export type PublishedFormScope = z.infer<typeof publishedFormScopeSchema>;

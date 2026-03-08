import { z } from 'zod';

export const FORM_STATUS_VALUES = ['draft', 'published', 'closed'] as const;
export const FORM_ACCESS_MODE_VALUES = [
  'anonymous',
  'authenticated',
  'authenticated_email',
] as const;
export const FORM_DENSITY_VALUES = ['airy', 'balanced', 'compact'] as const;
export const FORM_SURFACE_STYLE_VALUES = ['paper', 'glass', 'panel'] as const;
export const FORM_THEME_ACCENT_VALUES = [
  'dynamic-green',
  'dynamic-orange',
  'dynamic-cyan',
  'dynamic-blue',
  'dynamic-purple',
  'dynamic-pink',
  'dynamic-indigo',
  'dynamic-yellow',
  'dynamic-red',
  'dynamic-gray',
] as const;
export const FORM_FONT_VALUES = [
  'barlow',
  'be-vietnam-pro',
  'dm-serif-display',
  'fira-sans',
  'fraunces',
  'inter',
  'lora',
  'manrope',
  'merriweather',
  'newsreader',
  'noto-sans',
  'noto-serif',
  'nunito-sans',
  'playfair-display',
  'plus-jakarta-sans',
  'source-sans-3',
  'source-serif-4',
  'space-grotesk',
  'spectral',
] as const;
export const FORM_QUESTION_TYPE_VALUES = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'linear_scale',
  'rating',
  'date',
  'time',
  'section_break',
] as const;
export const FORM_LOGIC_OPERATOR_VALUES = [
  'equals',
  'not_equals',
  'contains',
] as const;
export const FORM_LOGIC_ACTION_VALUES = ['go_to_section', 'submit'] as const;

export const formMediaSchema = z.object({
  storagePath: z.string().max(500).optional().default(''),
  url: z.string().max(2000).optional().default(''),
  alt: z.string().max(160).optional().default(''),
});

const canonicalUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const formStudioIdentifierSchema = z.string().min(1);

const defaultFormMediaValue = {
  storagePath: '',
  url: '',
  alt: '',
};

export const formOptionSchema = z.object({
  id: formStudioIdentifierSchema.optional(),
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(120),
});

export const formQuestionSettingsSchema = z.object({
  placeholder: z.string().max(240).optional(),
  minLabel: z.string().max(80).optional(),
  maxLabel: z.string().max(80).optional(),
  scaleMin: z.number().int().min(0).max(10).optional(),
  scaleMax: z.number().int().min(1).max(10).optional(),
  ratingMax: z.number().int().min(2).max(10).optional(),
});

export const formQuestionSchema = z.object({
  id: formStudioIdentifierSchema.optional(),
  type: z.enum(FORM_QUESTION_TYPE_VALUES),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  required: z.boolean().default(false),
  settings: formQuestionSettingsSchema.default({}),
  options: z.array(formOptionSchema).default([]),
});

export const formSectionSchema = z.object({
  id: formStudioIdentifierSchema.optional(),
  title: z.string().trim().max(160).default(''),
  description: z.string().max(800).optional().default(''),
  image: formMediaSchema.default(defaultFormMediaValue),
  questions: z.array(formQuestionSchema).min(1),
});

export const formLogicRuleSchema = z
  .object({
    id: formStudioIdentifierSchema.optional(),
    sourceQuestionId: formStudioIdentifierSchema.min(
      1,
      'Select a question for each branching rule.'
    ),
    operator: z.enum(FORM_LOGIC_OPERATOR_VALUES),
    comparisonValue: z.string().trim().min(1),
    actionType: z.enum(FORM_LOGIC_ACTION_VALUES),
    targetSectionId: formStudioIdentifierSchema
      .min(1, 'Select a target section for each branching rule.')
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.actionType === 'submit' ||
      (value.actionType === 'go_to_section' && value.targetSectionId),
    {
      message: 'Branching rules that navigate must target a section.',
      path: ['targetSectionId'],
    }
  );

export const formThemeSchema = z.object({
  presetId: z.string().trim().min(1).max(40),
  density: z.enum(FORM_DENSITY_VALUES),
  accentColor: z.enum(FORM_THEME_ACCENT_VALUES).default('dynamic-green'),
  headlineFontId: z.enum(FORM_FONT_VALUES).default('noto-serif'),
  bodyFontId: z.enum(FORM_FONT_VALUES).default('be-vietnam-pro'),
  surfaceStyle: z.enum(FORM_SURFACE_STYLE_VALUES),
  coverHeadline: z.string().max(120).default(''),
  coverKicker: z.string().max(120).default(''),
  coverImage: formMediaSchema.default(defaultFormMediaValue),
  sectionImages: z.record(z.string(), formMediaSchema).default({}),
});

export const formSettingsSchema = z.object({
  showProgressBar: z.boolean().default(true),
  allowMultipleSubmissions: z.boolean().default(true),
  oneResponsePerUser: z.boolean().default(false),
  requireTurnstile: z.boolean().default(true),
  confirmationTitle: z.string().max(120).default('Response received'),
  confirmationMessage: z
    .string()
    .max(1000)
    .default('Thanks for taking the time to respond.'),
});

export const formStudioSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  status: z.enum(FORM_STATUS_VALUES).default('draft'),
  accessMode: z.enum(FORM_ACCESS_MODE_VALUES).default('anonymous'),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  maxResponses: z.number().int().positive().nullable().optional(),
  theme: formThemeSchema,
  settings: formSettingsSchema,
  sections: z.array(formSectionSchema).min(1),
  logicRules: z.array(formLogicRuleSchema).default([]),
});

export const formAnswerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.number(),
  z.null(),
]);

export const formProgressSchema = z.object({
  sessionId: canonicalUuidSchema,
  lastQuestionId: canonicalUuidSchema.nullable().optional(),
  lastSectionId: canonicalUuidSchema.nullable().optional(),
});

export const formSubmitSchema = z.object({
  sessionId: canonicalUuidSchema,
  turnstileToken: z.string().max(4096).optional(),
  answers: z.record(canonicalUuidSchema, formAnswerValueSchema),
});

export type FormStudioInput = z.infer<typeof formStudioSchema>;
export type FormSectionInput = z.infer<typeof formSectionSchema>;
export type FormQuestionInput = z.infer<typeof formQuestionSchema>;
export type FormLogicRuleInput = z.infer<typeof formLogicRuleSchema>;
export type FormThemeInput = z.infer<typeof formThemeSchema>;
export type FormSettingsInput = z.infer<typeof formSettingsSchema>;
export type FormSubmitInput = z.infer<typeof formSubmitSchema>;

export function createDefaultFormStudioInput(): FormStudioInput {
  return {
    title: 'Untitled form',
    description: '',
    status: 'draft',
    accessMode: 'anonymous',
    openAt: null,
    closeAt: null,
    maxResponses: null,
    theme: {
      presetId: 'editorial-moss',
      density: 'balanced',
      accentColor: 'dynamic-green',
      headlineFontId: 'noto-serif',
      bodyFontId: 'be-vietnam-pro',
      surfaceStyle: 'paper',
      coverHeadline: '',
      coverKicker: 'Measured, warm, thoughtful',
      coverImage: {
        storagePath: '',
        url: '',
        alt: '',
      },
      sectionImages: {},
    },
    settings: {
      showProgressBar: true,
      allowMultipleSubmissions: true,
      oneResponsePerUser: false,
      requireTurnstile: true,
      confirmationTitle: 'Response received',
      confirmationMessage: 'Thanks for taking the time to respond.',
    },
    sections: [
      {
        title: 'Section 1',
        description: '',
        image: {
          storagePath: '',
          url: '',
          alt: '',
        },
        questions: [
          {
            type: 'short_text',
            title: 'What should we know?',
            description: '',
            required: true,
            settings: {
              placeholder: 'Write your answer here',
            },
            options: [],
          },
        ],
      },
    ],
    logicRules: [],
  };
}

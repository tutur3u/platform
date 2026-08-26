import { z } from 'zod';

export const FORM_TITLE_MAX_LENGTH = 4000;
export const FORM_DESCRIPTION_MAX_LENGTH = 16000;
export const FORM_SECTION_TITLE_MAX_LENGTH = 2000;
export const FORM_SECTION_DESCRIPTION_MAX_LENGTH = 8000;
export const FORM_QUESTION_TITLE_MAX_LENGTH = 4000;
export const FORM_QUESTION_DESCRIPTION_MAX_LENGTH = 16000;
export const FORM_RESPONSE_ANSWER_MAX_LENGTH = 16000;
export const FORM_CONFIRMATION_TITLE_MAX_LENGTH = 120;
export const FORM_CONFIRMATION_MESSAGE_MAX_LENGTH = 1000;
/**
 * SEO limits track what search engines and social cards actually render, not
 * what the column can hold: titles are truncated around 60 characters in a
 * result listing and descriptions around 160, so allowing more would only let
 * someone write copy that silently gets cut.
 */
export const FORM_SEO_TITLE_MAX_LENGTH = 120;
export const FORM_SEO_DESCRIPTION_MAX_LENGTH = 320;
export const FORM_SEO_KEYWORD_MAX_LENGTH = 60;
export const FORM_SEO_KEYWORDS_MAX_COUNT = 12;

export const FORM_STATUS_VALUES = ['draft', 'published', 'closed'] as const;
export const FORM_ACCESS_MODE_VALUES = [
  'anonymous',
  'authenticated',
  'authenticated_email',
] as const;
export const FORM_DENSITY_VALUES = ['airy', 'balanced', 'compact'] as const;
/**
 * `sections` shows a whole section per screen (the original behaviour);
 * `one_question` gives each answerable question its own screen. Branching still
 * runs at section boundaries in both.
 */
export const FORM_DISPLAY_MODE_VALUES = ['sections', 'one_question'] as const;
export const FORM_SURFACE_STYLE_VALUES = ['paper', 'glass', 'panel'] as const;
export const FORM_OPTION_LAYOUT_VALUES = ['list', 'grid'] as const;
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
  'rich_text',
  'image',
  'youtube',
  'divider',
] as const;
export const FORM_TEXT_SIZE_VALUES = ['sm', 'md', 'lg'] as const;
export const FORM_LOGIC_OPERATOR_VALUES = [
  'equals',
  'not_equals',
  'contains',
] as const;
export const FORM_LOGIC_ACTION_VALUES = ['go_to_section', 'submit'] as const;
export const FORM_LOGIC_TRIGGER_VALUES = ['question', 'section_end'] as const;

const formIsoDateTimeSchema = z.iso.datetime({ offset: true });
const formLocalIsoDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

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
  label: z.string().trim().min(1).max(2000),
  value: z.string().trim().min(1).max(120),
  image: formMediaSchema.default(defaultFormMediaValue),
});

export const FORM_VALIDATION_MODE_VALUES = [
  'none',
  'integer',
  'real',
  'numeric',
  'regex',
  'email',
  'url',
] as const;

export const formQuestionSettingsSchema = z.object({
  placeholder: z.string().max(240).nullable().optional(),
  minLabel: z.string().max(80).nullable().optional(),
  maxLabel: z.string().max(80).nullable().optional(),
  scaleMin: z.number().int().min(0).max(10).nullable().optional(),
  scaleMax: z.number().int().min(1).max(10).nullable().optional(),
  ratingMax: z.number().int().min(2).max(10).nullable().optional(),
  optionLayout: z.enum(FORM_OPTION_LAYOUT_VALUES).nullable().optional(),
  youtubeUrl: z.string().max(2000).nullable().optional(),
  youtubeVideoId: z.string().max(32).nullable().optional(),
  youtubeStartSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  validationMode: z.enum(FORM_VALIDATION_MODE_VALUES).nullable().optional(),
  validationMin: z.number().nullable().optional(),
  validationMax: z.number().nullable().optional(),
  validationPattern: z.string().max(500).nullable().optional(),
  validationMessage: z.string().max(200).nullable().optional(),
});

export const formQuestionSchema = z.object({
  id: formStudioIdentifierSchema.optional(),
  type: z.enum(FORM_QUESTION_TYPE_VALUES),
  title: z.string().trim().min(1).max(FORM_QUESTION_TITLE_MAX_LENGTH),
  description: z
    .string()
    .max(FORM_QUESTION_DESCRIPTION_MAX_LENGTH)
    .optional()
    .default(''),
  required: z.boolean().default(false),
  image: formMediaSchema.default(defaultFormMediaValue),
  settings: formQuestionSettingsSchema.default({}),
  options: z.array(formOptionSchema).default([]),
});

export const formSectionSchema = z.object({
  id: formStudioIdentifierSchema.optional(),
  title: z.string().trim().max(FORM_SECTION_TITLE_MAX_LENGTH).default(''),
  description: z
    .string()
    .max(FORM_SECTION_DESCRIPTION_MAX_LENGTH)
    .optional()
    .default(''),
  image: formMediaSchema.default(defaultFormMediaValue),
  questions: z.array(formQuestionSchema).min(1),
});

export const formLogicRuleSchema = z
  .object({
    id: formStudioIdentifierSchema.optional(),
    triggerType: z.enum(FORM_LOGIC_TRIGGER_VALUES).default('question'),
    sourceSectionId: formStudioIdentifierSchema.nullable().optional(),
    sourceQuestionId: formStudioIdentifierSchema.nullable().optional(),
    operator: z.enum(FORM_LOGIC_OPERATOR_VALUES).default('equals'),
    comparisonValue: z.string().trim().default(''),
    actionType: z.enum(FORM_LOGIC_ACTION_VALUES),
    targetSectionId: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.actionType !== 'submit' &&
      (value.actionType !== 'go_to_section' || !value.targetSectionId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Branching rules that navigate must target a section.',
        path: ['targetSectionId'],
      });
    }

    if (value.triggerType === 'question') {
      if (!value.sourceQuestionId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select a question for each branching rule.',
          path: ['sourceQuestionId'],
        });
      }
      if (!value.comparisonValue?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Comparison value is required for question-based rules.',
          path: ['comparisonValue'],
        });
      }
    }

    if (value.triggerType === 'section_end') {
      if (!value.sourceSectionId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select a section for section-end rules.',
          path: ['sourceSectionId'],
        });
      }
      if (value.sourceQuestionId?.trim() && !value.comparisonValue?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Comparison value is required when a question is selected for section-end rules.',
          path: ['comparisonValue'],
        });
      }
    }
  });

export const formThemeSchema = z.object({
  presetId: z.string().trim().min(1).max(40),
  density: z.enum(FORM_DENSITY_VALUES),
  accentColor: z.enum(FORM_THEME_ACCENT_VALUES).default('dynamic-green'),
  headlineFontId: z.enum(FORM_FONT_VALUES).default('noto-serif'),
  bodyFontId: z.enum(FORM_FONT_VALUES).default('be-vietnam-pro'),
  surfaceStyle: z.enum(FORM_SURFACE_STYLE_VALUES),
  coverHeadline: z.string().max(120).default(''),
  coverImage: formMediaSchema.default(defaultFormMediaValue),
  sectionImages: z.record(z.string(), formMediaSchema).default({}),
  typography: z
    .object({
      displaySize: z.enum(FORM_TEXT_SIZE_VALUES).default('md'),
      headingSize: z.enum(FORM_TEXT_SIZE_VALUES).default('md'),
      bodySize: z.enum(FORM_TEXT_SIZE_VALUES).default('md'),
    })
    .default({
      displaySize: 'md',
      headingSize: 'md',
      bodySize: 'md',
    }),
});

export const formSeoSchema = z.object({
  /** Overrides the title derived from the form's cover headline or title. */
  title: z.string().trim().max(FORM_SEO_TITLE_MAX_LENGTH).default(''),
  /** Overrides the description derived from the form or its first section. */
  description: z
    .string()
    .trim()
    .max(FORM_SEO_DESCRIPTION_MAX_LENGTH)
    .default(''),
  /** Replaces the generated Open Graph card with an uploaded image. */
  image: formMediaSchema.default(defaultFormMediaValue),
  /** Replaces the derived keyword list. Empty means "derive". */
  keywords: z
    .array(z.string().trim().min(1).max(FORM_SEO_KEYWORD_MAX_LENGTH))
    .max(FORM_SEO_KEYWORDS_MAX_COUNT)
    .default([]),
  /** Points crawlers at a different canonical URL for this form. */
  canonicalUrl: z.union([z.literal(''), z.url().max(2000)]).default(''),
  /** Emits `noindex, nofollow` for the public page. */
  noIndex: z.boolean().default(false),
});

export const FORM_WELCOME_TITLE_MAX_LENGTH = 120;
export const FORM_WELCOME_DESCRIPTION_MAX_LENGTH = 600;
export const FORM_WELCOME_BUTTON_MAX_LENGTH = 40;

export const formSettingsSchema = z.object({
  displayMode: z.enum(FORM_DISPLAY_MODE_VALUES).default('sections'),
  /** Optional cover screen shown before the first question. */
  welcomeEnabled: z.boolean().default(false),
  welcomeTitle: z.string().max(FORM_WELCOME_TITLE_MAX_LENGTH).default(''),
  welcomeDescription: z
    .string()
    .max(FORM_WELCOME_DESCRIPTION_MAX_LENGTH)
    .default(''),
  welcomeButtonLabel: z
    .string()
    .max(FORM_WELCOME_BUTTON_MAX_LENGTH)
    .default(''),
  showProgressBar: z.boolean().default(true),
  allowMultipleSubmissions: z.boolean().default(true),
  oneResponsePerUser: z.boolean().default(false),
  requireTurnstile: z.boolean().default(true),
  confirmationTitle: z
    .string()
    .max(FORM_CONFIRMATION_TITLE_MAX_LENGTH)
    .default('Response received'),
  confirmationMessage: z
    .string()
    .max(FORM_CONFIRMATION_MESSAGE_MAX_LENGTH)
    .default('Thanks for taking the time to respond.'),
});

function normalizeLegacyLocalIsoDateTime(value: string): string | null {
  const match = formLocalIsoDateTimePattern.exec(value);
  if (!match) {
    return null;
  }

  const [, yearPart, monthPart, dayPart, hourPart, minutePart, secondPart] =
    match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const second = Number(secondPart ?? '0');
  const date = new Date(year, month - 1, day, hour, minute, second, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  return date.toISOString();
}

export function normalizeOptionalFormDateTimeValue(value: unknown): unknown {
  if (value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  if (formIsoDateTimeSchema.safeParse(value).success) {
    return value;
  }

  return normalizeLegacyLocalIsoDateTime(value) ?? value;
}

const optionalFormDateTimeSchema = z.preprocess(
  normalizeOptionalFormDateTimeValue,
  formIsoDateTimeSchema.nullable().optional()
);

export const formStudioSchema = z.object({
  title: z.string().trim().min(1).max(FORM_TITLE_MAX_LENGTH),
  description: z.string().max(FORM_DESCRIPTION_MAX_LENGTH).default(''),
  status: z.enum(FORM_STATUS_VALUES).default('draft'),
  accessMode: z.enum(FORM_ACCESS_MODE_VALUES).default('anonymous'),
  openAt: optionalFormDateTimeSchema,
  closeAt: optionalFormDateTimeSchema,
  maxResponses: z.number().int().positive().nullable().optional(),
  theme: formThemeSchema,
  settings: formSettingsSchema,
  seo: formSeoSchema.default({
    title: '',
    description: '',
    image: defaultFormMediaValue,
    keywords: [],
    canonicalUrl: '',
    noIndex: false,
  }),
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
  sendResponseCopy: z.boolean().optional().default(false),
  answers: z.record(canonicalUuidSchema, formAnswerValueSchema),
});

/** Current format version for portable form export/import. Bump when breaking changes occur. */
export const FORM_EXPORT_FORMAT_VERSION = '1';

export const formExportEnvelopeSchema = z.object({
  formatVersion: z.literal(FORM_EXPORT_FORMAT_VERSION),
  exportedAt: z.string().datetime(),
  form: formStudioSchema,
});

export type FormExportEnvelope = z.infer<typeof formExportEnvelopeSchema>;

export type FormStudioInput = z.infer<typeof formStudioSchema>;
export type FormSectionInput = z.infer<typeof formSectionSchema>;
export type FormQuestionInput = z.infer<typeof formQuestionSchema>;
export type FormLogicRuleInput = z.infer<typeof formLogicRuleSchema>;
export type FormThemeInput = z.infer<typeof formThemeSchema>;
export type FormSettingsInput = z.infer<typeof formSettingsSchema>;
export type FormSeoInput = z.infer<typeof formSeoSchema>;
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
      coverImage: {
        storagePath: '',
        url: '',
        alt: '',
      },
      sectionImages: {},
      typography: {
        displaySize: 'md',
        headingSize: 'md',
        bodySize: 'md',
      },
    },
    settings: {
      displayMode: 'sections',
      welcomeEnabled: false,
      welcomeTitle: '',
      welcomeDescription: '',
      welcomeButtonLabel: '',
      showProgressBar: true,
      allowMultipleSubmissions: true,
      oneResponsePerUser: false,
      requireTurnstile: true,
      confirmationTitle: 'Response received',
      confirmationMessage: 'Thanks for taking the time to respond.',
    },
    seo: {
      title: '',
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      keywords: [],
      canonicalUrl: '',
      noIndex: false,
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
            image: {
              storagePath: '',
              url: '',
              alt: '',
            },
            settings: {
              placeholder: 'Write your answer here',
              optionLayout: 'list',
            },
            options: [],
          },
        ],
      },
    ],
    logicRules: [],
  };
}

import type {
  ValseaClassroomOutputType,
  ValseaPronunciationAssessorModel,
} from '@tuturuuu/internal-api';

export type LanguageOption = {
  labelKey: string;
  value: string;
};

export type OutputOption = {
  labelKey: string;
  value: ValseaClassroomOutputType;
};

export type PronunciationModelOption = {
  labelKey: string;
  value: ValseaPronunciationAssessorModel;
};

export type ScenarioModeOption = {
  labelKey: string;
  value:
    | 'parent_update'
    | 'pronunciation_lab'
    | 'regional_classroom'
    | 'sentiment_lab'
    | 'surprise';
};

export const INPUT_LANGUAGES: LanguageOption[] = [
  { labelKey: 'language_auto', value: 'auto' },
  { labelKey: 'language_singlish', value: 'singlish' },
  { labelKey: 'language_vietnamese', value: 'vietnamese' },
  { labelKey: 'language_english', value: 'english' },
  { labelKey: 'language_filipino', value: 'filipino' },
  { labelKey: 'language_malay', value: 'malay' },
  { labelKey: 'language_thai', value: 'thai' },
  { labelKey: 'language_chinese', value: 'chinese' },
  { labelKey: 'language_tamil', value: 'tamil' },
];

export const TARGET_LANGUAGES: LanguageOption[] = [
  { labelKey: 'language_vietnamese', value: 'vietnamese' },
  { labelKey: 'language_english', value: 'english' },
  { labelKey: 'language_chinese', value: 'chinese' },
  { labelKey: 'language_thai', value: 'thai' },
  { labelKey: 'language_filipino', value: 'filipino' },
  { labelKey: 'language_malay', value: 'malay' },
];

export const OUTPUT_TYPES: OutputOption[] = [
  { labelKey: 'output_action_items', value: 'action_items' },
  { labelKey: 'output_interview_notes', value: 'interview_notes' },
  { labelKey: 'output_key_quotes', value: 'key_quotes' },
  { labelKey: 'output_subtitles', value: 'subtitles' },
  { labelKey: 'output_email_summary', value: 'email_summary' },
  { labelKey: 'output_meeting_minutes', value: 'meeting_minutes' },
  { labelKey: 'output_service_log', value: 'service_log' },
];

export const PRONUNCIATION_MODELS: PronunciationModelOption[] = [
  {
    labelKey: 'pronunciation_model_whisper_large_v3_turbo',
    value: 'local-whisper-large-v3-turbo',
  },
  {
    labelKey: 'pronunciation_model_whisper_large_v3',
    value: 'local-whisper-large-v3',
  },
  {
    labelKey: 'pronunciation_model_whisper_medium',
    value: 'local-whisper-medium',
  },
  {
    labelKey: 'pronunciation_model_whisper_small',
    value: 'local-whisper-small',
  },
  {
    labelKey: 'pronunciation_model_whisper_base',
    value: 'local-whisper-base',
  },
  {
    labelKey: 'pronunciation_model_whisper_tiny',
    value: 'local-whisper-tiny',
  },
  { labelKey: 'pronunciation_model_wav2vec2', value: 'local-wav2vec2' },
];

export const SUGGESTED_PROMPTS = ['sample_1', 'sample_2', 'sample_3'] as const;

export const SCENARIO_MODES: ScenarioModeOption[] = [
  { labelKey: 'scenario_mode_surprise', value: 'surprise' },
  { labelKey: 'scenario_mode_sentiment_lab', value: 'sentiment_lab' },
  { labelKey: 'scenario_mode_pronunciation_lab', value: 'pronunciation_lab' },
  { labelKey: 'scenario_mode_regional_classroom', value: 'regional_classroom' },
  { labelKey: 'scenario_mode_parent_update', value: 'parent_update' },
];

export const STUDIO_STEPS = [
  'pipeline_mira',
  'pipeline_voice',
  'pipeline_preview',
  'pipeline_valsea',
  'pipeline_sentiment',
  'pipeline_artifact',
] as const;

import type {
  ValseaClassroomArtifactResponse,
  ValseaClassroomOutputType,
  ValseaPronunciationAssessorModel,
} from '@tuturuuu/internal-api';

export type InsightTone = 'cyan' | 'green' | 'orange' | 'pink' | 'yellow';

export type StudioInsight = {
  detail?: string;
  label: string;
  tone: InsightTone;
  value?: string;
};

export type ValseaTranslate = (
  key: string,
  values?: Record<string, number | string>
) => string;

const CODE_SWITCH_PATTERNS = [
  /\b(ah|lah|leh|lor|chim|blur)\b/iu,
  /[\u00C0-\u1EF9]/u,
];

export function getTranscriptInsights({
  fileName,
  language,
  outputType,
  pronunciationModel,
  t,
  targetLanguage,
  transcript,
}: {
  fileName?: string;
  language: string;
  outputType: ValseaClassroomOutputType;
  pronunciationModel: ValseaPronunciationAssessorModel;
  t: ValseaTranslate;
  targetLanguage: string;
  transcript: string;
}): StudioInsight[] {
  const words = transcript.trim().split(/\s+/u).filter(Boolean);
  const hasCodeSwitch = CODE_SWITCH_PATTERNS.some((pattern) =>
    pattern.test(transcript)
  );
  const hasQuestion =
    /[?]|(?:\bhow\b|\bwhy\b|\bwhat\b|\bcould\b|\bcan\b)/iu.test(transcript);

  return [
    {
      detail: hasCodeSwitch
        ? t('insight_code_switch_detail')
        : t('insight_clean_input_detail'),
      label: hasCodeSwitch
        ? t('insight_code_switch_label')
        : t('insight_clean_input_label'),
      tone: hasCodeSwitch ? 'cyan' : 'green',
      value: language,
    },
    {
      detail: t('insight_word_count', { count: words.length || 0 }),
      label:
        words.length > 55
          ? t('insight_dense_note_label')
          : t('insight_quick_beat_label'),
      tone: words.length > 55 ? 'orange' : 'green',
      value: targetLanguage,
    },
    {
      detail: hasQuestion
        ? t('insight_confusion_detail')
        : t('insight_artifact_detail'),
      label: hasQuestion
        ? t('insight_confusion_label')
        : t('insight_artifact_label'),
      tone: hasQuestion ? 'yellow' : 'cyan',
      value: t(`output_${outputType}`),
    },
    {
      detail: fileName || t('insight_text_only_detail'),
      label: fileName
        ? t('insight_voice_ready_label')
        : t('insight_add_audio_label'),
      tone: fileName ? 'pink' : 'orange',
      value: pronunciationModel.replace('local-', ''),
    },
  ];
}

export function getResultInsights(
  result: ValseaClassroomArtifactResponse,
  t: ValseaTranslate
): StudioInsight[] {
  const pronunciation = result.pronunciation;
  const hasPronunciationGrade = pronunciation?.status === 'graded';
  const tagCount = result.annotations.semanticTags.length;
  const confidence =
    typeof result.sentiment.confidence === 'number'
      ? Math.round(result.sentiment.confidence * 100)
      : null;

  return [
    {
      detail: result.translation.targetLanguage,
      label: t('insight_translation_shipped_label'),
      tone: 'cyan',
      value: result.translation.text
        ? t('insight_ready_value')
        : t('insight_missing_value'),
    },
    {
      detail: t('insight_cue_count', { count: tagCount }),
      label:
        tagCount > 0
          ? t('insight_semantic_map_label')
          : t('insight_no_cues_label'),
      tone: tagCount > 0 ? 'green' : 'orange',
      value:
        tagCount > 0 ? t('insight_annotated_value') : t('insight_plain_value'),
    },
    {
      detail: pronunciation
        ? hasPronunciationGrade
          ? t('insight_native_like', {
              score: pronunciation.nativeSimilarity,
            })
          : pronunciation.status
        : t('insight_needs_audio_detail'),
      label: pronunciation
        ? t('insight_voice_evidence_label')
        : t('insight_text_evidence_label'),
      tone: pronunciation ? 'pink' : 'yellow',
      value: hasPronunciationGrade
        ? `${pronunciation.overallScore}%`
        : pronunciation
          ? t('insight_skip_value')
          : t('insight_skip_value'),
    },
    {
      detail: result.sentiment.sentiment || t('insight_tone_unknown'),
      label: t('insight_learner_state_label'),
      tone: confidence && confidence > 80 ? 'green' : 'yellow',
      value: confidence ? `${confidence}%` : t('insight_scan_value'),
    },
  ];
}

export function getTeachingMoves(
  result: ValseaClassroomArtifactResponse,
  t: ValseaTranslate
) {
  const primaryTag = result.annotations.semanticTags[0];
  const phrase =
    primaryTag?.phrase ||
    result.pronunciation?.words.find((word) => word.level !== 'green')
      ?.expected ||
    result.source.transcript.split(/\s+/u).slice(0, 4).join(' ');
  const sentiment = result.sentiment.sentiment || 'uncertain';
  const translation = result.translation.targetLanguage || 'target language';

  return [
    {
      label: t('teaching_move_sticky_phrase'),
      value: phrase,
    },
    {
      label: t('teaching_move_mirror_mood'),
      value: sentiment,
    },
    {
      label: t('teaching_move_language_proof'),
      value: translation,
    },
  ];
}

'use client';

import {
  BookOpen,
  Brain,
  CheckCircle2,
  FileAudio,
  FileJson,
  Flame,
  Languages,
  Loader2,
  Route,
  Sparkles,
  Trophy,
} from '@tuturuuu/icons';
import type {
  ValseaClassroomArtifactResponse,
  ValseaVoiceGradeLevel,
  ValseaVoiceGradeResult,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { useTranslations } from 'next-intl';
import { STUDIO_STEPS } from './constants';
import {
  getResultInsights,
  getTeachingMoves,
  type ValseaTranslate,
} from './insights';
import {
  ResearchObservabilityPanel,
  RunJsonDialog,
} from './research-observability';

const STEP_ICONS = [
  FileAudio,
  Brain,
  Sparkles,
  Languages,
  Brain,
  BookOpen,
] as const;

export function PipelineStrip({
  hasApiKey,
  isLoading,
  t,
}: {
  hasApiKey: boolean;
  isLoading: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Card className="valsea-reveal overflow-hidden border-foreground/10 bg-foreground/[0.03]">
      <CardContent className="grid gap-0 p-0 md:grid-cols-3 xl:grid-cols-6">
        {STUDIO_STEPS.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? Sparkles;
          return (
            <div
              className="group min-h-28 border-foreground/10 border-b p-4 transition-colors duration-500 hover:bg-dynamic-green/8 md:border-r md:border-b-0 last:md:border-r-0"
              key={step}
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green transition-transform duration-700 ease-out group-hover:scale-105">
                  {isLoading && index === 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <span className="font-mono text-foreground/35 text-xs">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="font-medium text-sm leading-5">{t(step)}</div>
            </div>
          );
        })}
      </CardContent>
      <div className="border-foreground/10 border-t px-4 py-3 text-foreground/60 text-xs">
        {hasApiKey ? t('key_state_ready') : t('key_state_missing')}
      </div>
    </Card>
  );
}

export function ResultsGrid({
  result,
  t,
}: {
  result: ValseaClassroomArtifactResponse;
  t: ReturnType<typeof useTranslations>;
}) {
  const confidence = result.sentiment.confidence;
  const valseaT = t as unknown as ValseaTranslate;
  const resultInsights = getResultInsights(result, valseaT);
  const teachingMoves = getTeachingMoves(result, valseaT);
  const confidenceLabel =
    typeof confidence === 'number'
      ? `${Math.round(confidence * 100)}%`
      : t('not_available');

  return (
    <div className="grid grid-flow-dense gap-4 lg:grid-cols-6">
      <OutcomeHero
        confidenceLabel={confidenceLabel}
        insights={resultInsights}
        result={result}
        t={t}
      />
      <SourceEvidencePanel result={result} t={t} />
      <ResultCard
        className="lg:col-span-3"
        content={result.clarification.text}
        eyebrow={t('clarified_eyebrow')}
        tone="green"
        title={t('clarified_title')}
      />
      <ResultCard
        className="lg:col-span-3"
        content={result.translation.text || t('not_available')}
        eyebrow={result.translation.targetLanguage}
        tone="cyan"
        title={t('translation_title')}
      />
      <ResultCard
        className="lg:col-span-4"
        content={result.artifact.output}
        eyebrow={t(`output_${result.artifact.outputType}`)}
        tone="orange"
        title={t('artifact_title')}
      />
      {result.pronunciation ? (
        <VoiceGradePanel grade={result.pronunciation} t={t} />
      ) : null}
      <TeachingMovesPanel moves={teachingMoves} t={t} />
      <Card className="valsea-stack-card border-dynamic-pink/20 bg-dynamic-pink/5 lg:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-dynamic-pink/25 bg-dynamic-pink/10 text-dynamic-pink hover:bg-dynamic-pink/15">
              {result.sentiment.sentiment || t('not_available')}
            </Badge>
            <Badge variant="secondary">{confidenceLabel}</Badge>
          </div>
          <CardTitle>{t('sentiment_title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-foreground/75 text-sm leading-6">
            {result.sentiment.reasoning || t('not_available')}
          </p>
          {result.sentiment.emotions.length ? (
            <div className="flex flex-wrap gap-2">
              {result.sentiment.emotions.map((emotion) => (
                <Badge key={emotion} variant="outline">
                  {emotion}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      {result.sentiment.layers?.mira ? (
        <SentimentCompass result={result} t={t} />
      ) : null}

      <Card className="valsea-stack-card border-foreground/10 bg-foreground/4 lg:col-span-3">
        <CardHeader>
          <CardTitle>{t('tags_title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {result.annotations.semanticTags.length ? (
            result.annotations.semanticTags.slice(0, 6).map((tag, index) => (
              <div
                className="rounded-md border border-foreground/10 bg-background/70 p-3 transition-transform duration-700 ease-out hover:-translate-y-0.5"
                key={`${tag.phrase}-${tag.tag}-${index}`}
              >
                <div className="font-semibold text-sm">
                  {tag.phrase || tag.tag || t('tag')}
                </div>
                <div className="mt-1 text-foreground/65 text-xs">
                  {[tag.tag, tag.meaning].filter(Boolean).join(' / ') ||
                    t('not_available')}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-foreground/10 bg-background/70 p-3 text-foreground/65 text-sm">
              {t('no_tags')}
            </div>
          )}
        </CardContent>
      </Card>

      {result.observability?.stages?.length ? (
        <ResearchObservabilityPanel result={result} t={t} />
      ) : null}

      <Card className="valsea-stack-card border-foreground/10 bg-foreground/4 lg:col-span-3">
        <CardHeader>
          <CardTitle>{t('raw_title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RunJsonDialog result={result} t={t}>
            <Button
              className="h-auto w-full justify-between border-foreground/10 bg-background/70 p-4 text-left hover:bg-background"
              type="button"
              variant="outline"
            >
              <span className="flex items-center gap-2">
                <FileJson className="h-4 w-4" />
                {t('raw_summary')}
              </span>
              <Badge variant="outline">{t('research_open_fullscreen')}</Badge>
            </Button>
          </RunJsonDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function SourceEvidencePanel({
  result,
  t,
}: {
  result: ValseaClassroomArtifactResponse;
  t: ReturnType<typeof useTranslations>;
}) {
  const spokenTranscript = result.source.spokenTranscript;
  const referenceTranscript = result.source.referenceTranscript;

  if (!spokenTranscript) return null;

  return (
    <Card className="valsea-stack-card border-dynamic-cyan/20 bg-dynamic-cyan/5 lg:col-span-6">
      <CardHeader>
        <CardTitle>{t('source_evidence_title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {spokenTranscript ? (
          <TranscriptBox
            label={t('source_spoken_transcript')}
            value={spokenTranscript}
          />
        ) : null}
        {referenceTranscript ? (
          <TranscriptBox
            label={t('source_reference_note')}
            value={referenceTranscript}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function OutcomeHero({
  confidenceLabel,
  insights,
  result,
  t,
}: {
  confidenceLabel: string;
  insights: ReturnType<typeof getResultInsights>;
  result: ValseaClassroomArtifactResponse;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Card className="valsea-stack-card overflow-hidden border-dynamic-green/20 bg-dynamic-green/5 lg:col-span-6">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge className="border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/15">
              <Trophy className="h-3.5 w-3.5" />
              {t('outcome_ready')}
            </Badge>
            <Badge variant="outline">{confidenceLabel}</Badge>
            <Badge variant="outline">
              {t(`output_${result.artifact.outputType}`)}
            </Badge>
          </div>
          <h2 className="max-w-3xl font-semibold text-4xl tracking-tight">
            {t('outcome_title')}
          </h2>
          <p className="mt-3 max-w-2xl text-foreground/68 text-sm leading-6">
            {t('outcome_description')}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {insights.map((insight) => (
            <div
              className="rounded-md border border-foreground/10 bg-background/70 p-3"
              key={insight.label}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{insight.label}</span>
                <span className="rounded-full border border-foreground/10 px-2 py-0.5 font-mono text-foreground/70 text-xs">
                  {insight.value}
                </span>
              </div>
              <div className="mt-1 text-foreground/58 text-xs">
                {insight.detail}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TeachingMovesPanel({
  moves,
  t,
}: {
  moves: ReturnType<typeof getTeachingMoves>;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Card className="valsea-stack-card border-dynamic-yellow/20 bg-dynamic-yellow/5 lg:col-span-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-dynamic-yellow" />
          <CardTitle>{t('teaching_moves_title')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {moves.map((move, index) => (
          <div
            className="rounded-md border border-dynamic-yellow/20 bg-background/70 p-4"
            key={move.label}
          >
            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-dynamic-yellow/10 text-dynamic-yellow">
              {index === 0 ? (
                <Flame className="h-4 w-4" />
              ) : index === 1 ? (
                <Brain className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </div>
            <div className="font-semibold text-sm">{move.label}</div>
            <p className="mt-2 text-foreground/65 text-sm leading-6">
              {move.value}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SentimentCompass({
  result,
  t,
}: {
  result: ValseaClassroomArtifactResponse;
  t: ReturnType<typeof useTranslations>;
}) {
  const mira = result.sentiment.layers?.mira;
  if (!mira) return null;

  const metrics = [
    {
      label: t('sentiment_valence'),
      value: normalizeSentimentMetric(mira.valence),
    },
    {
      label: t('sentiment_arousal'),
      value: normalizeSentimentMetric(mira.arousal),
    },
    {
      label: t('sentiment_urgency'),
      value: normalizeSentimentMetric(mira.urgency),
    },
    {
      label: t('sentiment_confusion'),
      value: normalizeSentimentMetric(mira.confusion),
    },
  ];

  return (
    <Card className="valsea-stack-card border-dynamic-cyan/20 bg-dynamic-cyan/5 lg:col-span-6">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan hover:bg-dynamic-cyan/15">
            {t('sentiment_mira_layer')}
          </Badge>
          <Badge variant="outline">
            {t(
              `sentiment_consensus_${result.sentiment.consensus || 'valsea_only'}`
            )}
          </Badge>
        </div>
        <CardTitle>{t('sentiment_compass_title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="grid gap-2 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div
              className="rounded-md border border-foreground/10 bg-background/70 p-3"
              key={metric.label}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{metric.label}</span>
                <span className="font-mono">{metric.value}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-foreground/10">
                <div
                  className="h-full rounded bg-dynamic-cyan"
                  style={{ width: `${metric.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-foreground/10 bg-background/70 p-4">
          <div className="font-semibold text-sm">{mira.intent}</div>
          <p className="mt-2 text-foreground/70 text-sm leading-6">
            {mira.parentSafeSummary || mira.teacherMove}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {mira.emotions?.map((emotion) => (
              <Badge key={emotion} variant="outline">
                {emotion}
              </Badge>
            ))}
          </div>
          {mira.evidenceSpans?.length ? (
            <div className="mt-4 grid gap-2">
              {mira.evidenceSpans.slice(0, 4).map((span, index) => (
                <div
                  className="rounded-md border border-dynamic-cyan/20 bg-dynamic-cyan/5 p-2 text-xs"
                  key={`${span.label}-${index}`}
                >
                  <span className="font-semibold text-dynamic-cyan">
                    {span.label}
                  </span>
                  <span className="text-foreground/65"> {span.quote}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function normalizeSentimentMetric(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return Math.round(Math.min(100, Math.max(0, percent)));
}

function VoiceGradePanel({
  grade,
  t,
}: {
  grade: ValseaVoiceGradeResult;
  t: ReturnType<typeof useTranslations>;
}) {
  const status = grade.status ?? 'graded';
  const isSkipped = status !== 'graded';
  const statusLevel = status === 'reference_mismatch' ? 'red' : 'amber';
  const referenceCoverage =
    typeof grade.referenceCoverage === 'number'
      ? `${Math.round(grade.referenceCoverage * 100)}%`
      : null;

  if (isSkipped) {
    return (
      <Card className="valsea-stack-card border-dynamic-yellow/20 bg-dynamic-yellow/5 lg:col-span-6">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={getGradeBadgeClasses(statusLevel)}>
              {getVoiceGradeStatusLabel(status, t)}
            </Badge>
            {referenceCoverage ? (
              <Badge variant="outline">
                {t('voice_grade_reference_coverage')}: {referenceCoverage}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {grade.provider === 'local-model'
                ? t('voice_grade_provider_local')
                : t('voice_grade_provider_valsea')}
            </Badge>
            {grade.assessorModel ? (
              <Badge variant="outline">{grade.assessorModel}</Badge>
            ) : null}
          </div>
          <CardTitle>{t('voice_grade_title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="rounded-md border border-dynamic-yellow/20 bg-background/70 p-4 text-foreground/78 text-sm leading-6">
            {grade.summary}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <TranscriptBox
              label={t('voice_grade_heard')}
              value={grade.heardText || t('not_available')}
            />
            <TranscriptBox
              label={t('voice_grade_reference')}
              value={grade.referenceText}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="valsea-stack-card border-foreground/10 bg-foreground/4 lg:col-span-6">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={getGradeBadgeClasses(scoreToLevel(grade.overallScore))}
          >
            {t('voice_grade_overall')}: {grade.overallScore}%
          </Badge>
          <Badge
            className={getGradeBadgeClasses(
              scoreToLevel(grade.nativeSimilarity)
            )}
          >
            {t('voice_grade_native')}: {grade.nativeSimilarity}%
          </Badge>
          <Badge variant="outline">
            {grade.provider === 'local-model'
              ? t('voice_grade_provider_local')
              : t('voice_grade_provider_valsea')}
          </Badge>
          {grade.assessorModel ? (
            <Badge variant="outline">{grade.assessorModel}</Badge>
          ) : null}
        </div>
        <CardTitle>{t('voice_grade_title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-foreground/70 text-sm leading-6">{grade.summary}</p>
        <p className="rounded-md border border-dynamic-yellow/20 bg-dynamic-yellow/5 p-3 text-dynamic-yellow text-sm leading-6">
          {t('voice_grade_score_hint')}
        </p>

        <div className="grid gap-3 rounded-md border border-foreground/10 bg-background/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-foreground/45 text-xs uppercase tracking-[0.2em]">
              {t('voice_grade_reference')}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ['green', t('voice_grade_character_matched')],
                ['amber', t('voice_grade_character_uncertain')],
                ['orange', t('voice_grade_character_substituted')],
                ['red', t('voice_grade_character_missing')],
              ].map(([level, label]) => (
                <span
                  className={`rounded-full px-2 py-1 ${getCharacterGradeClasses(level as ValseaVoiceGradeLevel)}`}
                  key={level}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-3 text-lg leading-8">
            {grade.words.map((word, wordIndex) => (
              <span
                className="inline-flex flex-wrap"
                key={`${word.expected}-${wordIndex}`}
              >
                {word.characters.map((character, characterIndex) => (
                  <span
                    className={`rounded px-0.5 ${getCharacterGradeClasses(character.level)}`}
                    key={`${character.character}-${characterIndex}`}
                    title={getCharacterTitle(character, t)}
                  >
                    {character.character}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <TranscriptBox
            label={t('voice_grade_heard')}
            value={grade.heardText}
          />
          <TranscriptBox
            label={t('voice_grade_reference')}
            value={grade.referenceText}
          />
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {grade.words.map((word, index) => (
            <div
              className={`rounded-md border p-3 ${getWordGradeClasses(word.level)}`}
              key={`${word.expected}-${index}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">{word.expected}</div>
                  <div className="mt-1 text-foreground/60 text-xs">
                    {word.heard || t('voice_grade_missing_word')}
                  </div>
                </div>
                <div className="font-mono text-sm">{word.score}%</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {word.characters
                  .filter((character) => character.character.trim())
                  .map((character, characterIndex) => (
                    <span
                      className={`rounded px-1.5 py-1 font-mono text-xs ${getCharacterGradeClasses(character.level)}`}
                      key={`${character.character}-${characterIndex}`}
                      title={getCharacterTitle(character, t)}
                    >
                      {character.character}
                    </span>
                  ))}
              </div>
              <div className="mt-3 grid gap-1.5 text-xs">
                <CharacterSummary
                  characters={word.characters}
                  status="matched"
                  title={t('voice_grade_good_sounds')}
                />
                <CharacterSummary
                  characters={word.characters}
                  status="substituted"
                  title={t('voice_grade_review_sounds')}
                />
                <CharacterSummary
                  characters={word.characters}
                  status="missing"
                  title={t('voice_grade_missing_sounds')}
                />
                <CharacterSummary
                  characters={word.characters}
                  status="uncertain"
                  title={t('voice_grade_uncertain_sounds')}
                />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded bg-background/80">
                <div
                  className={getGradeBarClasses(word.level)}
                  style={{ width: `${word.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getVoiceGradeStatusLabel(
  status: NonNullable<ValseaVoiceGradeResult['status']>,
  t: ReturnType<typeof useTranslations>
) {
  if (status === 'insufficient_speech') {
    return t('voice_grade_status_insufficient_speech');
  }

  if (status === 'reference_mismatch') {
    return t('voice_grade_status_reference_mismatch');
  }

  return t('voice_grade_status_graded');
}

function CharacterSummary({
  characters,
  status,
  title,
}: {
  characters: ValseaVoiceGradeResult['words'][number]['characters'];
  status: NonNullable<
    ValseaVoiceGradeResult['words'][number]['characters'][number]['status']
  >;
  title: string;
}) {
  const filtered = characters.filter(
    (character) => character.status === status && character.character.trim()
  );
  if (!filtered.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 text-foreground/62">
      <span>{title}:</span>
      <span className="font-mono">
        {filtered.map((character) => character.character).join(' ')}
      </span>
    </div>
  );
}

function TranscriptBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/70 p-3">
      <div className="font-mono text-foreground/45 text-xs uppercase tracking-[0.2em]">
        {label}
      </div>
      <p className="mt-2 text-foreground/75 text-sm leading-6">{value}</p>
    </div>
  );
}

function scoreToLevel(score: number): ValseaVoiceGradeLevel {
  if (score >= 85) return 'green';
  if (score >= 70) return 'amber';
  if (score >= 50) return 'orange';
  return 'red';
}

function getGradeBadgeClasses(level: ValseaVoiceGradeLevel) {
  const classes = {
    amber:
      'border-dynamic-yellow/25 bg-dynamic-yellow/10 text-dynamic-yellow hover:bg-dynamic-yellow/15',
    green:
      'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/15',
    orange:
      'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/15',
    red: 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15',
  };

  return classes[level];
}

function getCharacterGradeClasses(level: ValseaVoiceGradeLevel) {
  const classes = {
    amber: 'bg-dynamic-yellow/15 text-dynamic-yellow',
    green: 'bg-dynamic-green/15 text-dynamic-green',
    orange: 'bg-dynamic-orange/15 text-dynamic-orange',
    red: 'bg-dynamic-red/15 text-dynamic-red',
  };

  return classes[level];
}

function getCharacterTitle(
  character: ValseaVoiceGradeResult['words'][number]['characters'][number],
  t: ReturnType<typeof useTranslations>
) {
  const status = character.status
    ? t(`voice_grade_character_${character.status}`)
    : `${character.score}%`;
  const heard = character.heard
    ? ` ${t('voice_grade_character_heard')}: ${character.heard}.`
    : '';
  const hint = character.hint ? ` ${character.hint}` : '';
  return `${status}. ${character.score}%.${heard}${hint}`;
}

function getWordGradeClasses(level: ValseaVoiceGradeLevel) {
  const classes = {
    amber: 'border-dynamic-yellow/20 bg-dynamic-yellow/5',
    green: 'border-dynamic-green/20 bg-dynamic-green/5',
    orange: 'border-dynamic-orange/20 bg-dynamic-orange/5',
    red: 'border-dynamic-red/20 bg-dynamic-red/5',
  };

  return classes[level];
}

function getGradeBarClasses(level: ValseaVoiceGradeLevel) {
  const classes = {
    amber: 'h-full rounded bg-dynamic-yellow',
    green: 'h-full rounded bg-dynamic-green',
    orange: 'h-full rounded bg-dynamic-orange',
    red: 'h-full rounded bg-dynamic-red',
  };

  return classes[level];
}

export function EmptyState({
  hasApiKey,
  onOpenKeyDialog,
  t,
}: {
  hasApiKey: boolean;
  onOpenKeyDialog: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Card className="valsea-reveal min-h-96 overflow-hidden border-dynamic-orange/20 bg-dynamic-orange/5">
      <CardContent className="grid min-h-96 gap-8 p-8 md:grid-cols-[1fr_0.75fr] md:items-center">
        <div className="max-w-xl">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-md border border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="font-semibold text-3xl tracking-tight">
            {hasApiKey ? t('empty_title') : t('empty_key_title')}
          </h2>
          <p className="mt-4 text-foreground/65 text-sm leading-6">
            {hasApiKey ? t('empty_description') : t('empty_key_description')}
          </p>
        </div>
        <button
          className="group grid min-h-56 rounded-md border border-dynamic-orange/25 bg-background/60 p-4 text-left transition-transform duration-700 ease-out hover:-translate-y-1 hover:bg-background"
          onClick={onOpenKeyDialog}
          type="button"
        >
          <div className="self-start font-mono text-dynamic-orange text-xs uppercase tracking-[0.22em]">
            {t('key_dialog_title')}
          </div>
          <div className="self-end">
            <div className="font-semibold text-xl">{t('key_dialog_save')}</div>
            <p className="mt-2 text-foreground/60 text-sm leading-6">
              {t('key_dialog_hint')}
            </p>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

function ResultCard({
  className,
  content,
  eyebrow,
  title,
  tone,
}: {
  className?: string;
  content: string;
  eyebrow: string;
  title: string;
  tone: 'cyan' | 'green' | 'orange';
}) {
  const toneClasses = {
    cyan: 'border-dynamic-cyan/20 bg-dynamic-cyan/5 text-dynamic-cyan',
    green: 'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green',
    orange: 'border-dynamic-orange/20 bg-dynamic-orange/5 text-dynamic-orange',
  }[tone];

  return (
    <Card className={`valsea-stack-card ${toneClasses} ${className ?? ''}`}>
      <CardHeader>
        <Badge className="w-fit border-current/20 bg-background/70 text-current hover:bg-background/80">
          {eyebrow}
        </Badge>
        <CardTitle className="text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-foreground/78 text-sm leading-6">
          {content}
        </p>
      </CardContent>
    </Card>
  );
}

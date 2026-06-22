'use client';

import {
  BookOpen,
  Brain,
  ChevronsUp,
  CircleDot,
  KeyRound,
  Languages,
  Loader2,
  Play,
  Sparkles,
  Volume2,
  WandSparkles,
} from '@tuturuuu/icons';
import type {
  ValseaClassroomOutputType,
  ValseaClassroomScenarioResponse,
  ValseaClassroomSpeechResponse,
  ValseaPronunciationAssessorModel,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AudioCapturePanel } from './audio-capture-panel';
import {
  INPUT_LANGUAGES,
  type LanguageOption,
  OUTPUT_TYPES,
  type OutputOption,
  PRONUNCIATION_MODELS,
  type PronunciationModelOption,
  SCENARIO_MODES,
  type ScenarioModeOption,
  SUGGESTED_PROMPTS,
  TARGET_LANGUAGES,
} from './constants';
import type { StudioInsight } from './insights';

export type AudioSource = 'generated' | 'recorded' | 'uploaded';

export function StudioNav({
  hasApiKey,
  isConfigLoading,
  onOpenKeyDialog,
  t,
}: {
  hasApiKey: boolean;
  isConfigLoading: boolean;
  onOpenKeyDialog: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="valsea-reveal flex flex-col gap-3 rounded-md border border-foreground/10 bg-background/75 p-2 shadow-[0_18px_60px_-45px_hsl(var(--foreground))] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background">
          <Languages className="h-4 w-4" />
        </span>
        <span className="font-semibold">{t('nav_title')}</span>
        <span className="hidden rounded-full border border-dynamic-green/20 bg-dynamic-green/8 px-2.5 py-1 font-mono text-dynamic-green text-xs md:inline-flex">
          {t('fullscreen_lab')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={hasApiKey ? 'secondary' : 'outline'}>
          {isConfigLoading
            ? t('key_state_checking')
            : hasApiKey
              ? t('key_state_ready')
              : t('key_state_missing')}
        </Badge>
        <Button
          className="min-h-11 rounded-md"
          onClick={onOpenKeyDialog}
          size="sm"
          variant={hasApiKey ? 'outline' : 'default'}
        >
          <KeyRound className="h-4 w-4" />
          {hasApiKey ? t('key_dialog_change') : t('key_dialog_save')}
        </Button>
      </div>
    </div>
  );
}

export function HeroPanel({
  hasApiKey,
  scenario,
  t,
}: {
  hasApiKey: boolean;
  scenario: ValseaClassroomScenarioResponse | null;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section className="valsea-reveal relative min-h-[34rem] overflow-hidden rounded-md border border-foreground/10 bg-foreground/[0.03] p-5 backdrop-blur md:p-7">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--foreground)/0.05)_1px,transparent_1px),linear-gradient(180deg,hsl(var(--foreground)/0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-dynamic-green/70 to-transparent" />
      <div className="relative grid min-h-[31rem] content-between gap-8">
        <div className="max-w-4xl">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge className="border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/15">
              {t('badge')}
            </Badge>
            <Badge variant="outline">{t('powered_by')}</Badge>
          </div>
          <h1 className="max-w-5xl text-[clamp(2.5rem,7vw,6.4rem)] leading-[0.9] tracking-tight">
            {t('hero_title_before')}{' '}
            <span className="text-dynamic-green">{t('hero_title_after')}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base text-foreground/66 leading-7">
            {t('hero_description')}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_18rem]">
          <div className="rounded-md border border-foreground/10 bg-background/70 p-4">
            <div className="font-mono text-foreground/45 text-xs uppercase tracking-[0.22em]">
              {t('provider_signal')}
            </div>
            <div className="mt-3 font-semibold text-2xl">
              {scenario?.title ??
                (hasApiKey ? t('key_state_ready') : t('key_state_missing'))}
            </div>
            {scenario ? (
              <p className="mt-3 text-foreground/65 text-sm leading-6">
                {scenario.teacherGoal}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/8 p-4">
              <Languages className="mb-4 h-5 w-5 text-dynamic-green" />
              {t('signal_audio')}
            </div>
            <div className="rounded-md border border-dynamic-cyan/20 bg-dynamic-cyan/8 p-4">
              <Sparkles className="mb-4 h-5 w-5 text-dynamic-cyan" />
              {t('signal_text')}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MissionBrief({
  hasApiKey,
  insights,
  scenario,
  t,
}: {
  hasApiKey: boolean;
  insights: StudioInsight[];
  scenario: ValseaClassroomScenarioResponse | null;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section className="valsea-reveal grid gap-3 rounded-md border border-foreground/10 bg-foreground/[0.03] p-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
      <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-dynamic-green text-xs uppercase tracking-[0.22em]">
              {t('mission_brief')}
            </div>
            <h2 className="mt-1 truncate font-semibold text-xl tracking-tight">
              {scenario?.title || t('mission_default_title')}
            </h2>
          </div>
          <Badge
            className="shrink-0"
            variant={hasApiKey ? 'secondary' : 'outline'}
          >
            {hasApiKey ? t('key_state_ready') : t('key_state_missing')}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {insights.map((insight) => (
            <SignalBadge insight={insight} key={insight.label} />
          ))}
        </div>
      </div>
      <div className="grid gap-2 rounded-md border border-foreground/10 bg-background/60 p-3">
        <div className="flex items-center gap-2 font-mono text-foreground/45 text-xs uppercase tracking-[0.18em]">
          <CircleDot className="h-4 w-4 text-dynamic-cyan" />
          {t('mission_rhythm')}
        </div>
        <div className="flex gap-2">
          {[t('rhythm_capture'), t('rhythm_infer'), t('rhythm_ship')].map(
            (label, index) => (
              <div
                className="min-w-24 rounded-md border border-foreground/10 bg-foreground/[0.03] px-3 py-2"
                key={label}
              >
                <div className="font-mono text-[0.65rem] text-foreground/40">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="mt-1 font-medium text-xs leading-4">
                  {label}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function SignalBadge({ insight }: { insight: StudioInsight }) {
  return (
    <div
      className={`min-w-0 rounded-full border px-3 py-1.5 ${getInsightToneClasses(insight.tone)}`}
    >
      <div className="flex items-center gap-2">
        <span className="max-w-40 truncate font-semibold text-xs">
          {insight.label}
        </span>
        {insight.value ? (
          <span className="rounded-full bg-background/70 px-2 py-0.5 font-mono text-[0.65rem]">
            {insight.value}
          </span>
        ) : null}
      </div>
      {insight.detail ? (
        <div className="mt-0.5 truncate text-[0.68rem] text-foreground/58">
          {insight.detail}
        </div>
      ) : null}
    </div>
  );
}

function getInsightToneClasses(tone: StudioInsight['tone']) {
  const classes = {
    cyan: 'border-dynamic-cyan/20 bg-dynamic-cyan/5 text-dynamic-cyan',
    green: 'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green',
    orange: 'border-dynamic-orange/20 bg-dynamic-orange/5 text-dynamic-orange',
    pink: 'border-dynamic-pink/20 bg-dynamic-pink/5 text-dynamic-pink',
    yellow: 'border-dynamic-yellow/20 bg-dynamic-yellow/5 text-dynamic-yellow',
  };

  return classes[tone];
}

export function ScenarioConsole({
  isGenerating,
  onGenerate,
  scenario,
  t,
}: {
  isGenerating: boolean;
  onGenerate: () => void;
  scenario: ValseaClassroomScenarioResponse | null;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Card className="valsea-reveal overflow-hidden border-dynamic-cyan/20 bg-dynamic-cyan/5">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[0.75fr_1.25fr] lg:p-6">
        <div>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md border border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan">
            <Brain className="h-5 w-5" />
          </div>
          <h2 className="font-semibold text-2xl tracking-tight">
            {t('scenario_console_title')}
          </h2>
          <p className="mt-3 text-foreground/66 text-sm leading-6">
            {t('scenario_console_description')}
          </p>
          <Button
            className="mt-5 min-h-11 gap-2"
            disabled={isGenerating}
            onClick={onGenerate}
            type="button"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? t('scenario_generating') : t('scenario_generate')}
          </Button>
        </div>

        <div className="grid gap-3">
          {scenario ? (
            <>
              <div className="rounded-md border border-foreground/10 bg-background/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {scenario.scenarioTags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 font-semibold text-xl">
                  {scenario.referencePhrase}
                </div>
                <p className="mt-2 text-foreground/68 text-sm leading-6">
                  {scenario.classroomContext}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <ScenarioMiniCard
                  icon={<Languages className="h-4 w-4" />}
                  label={t('scenario_learner')}
                  value={scenario.learnerPersona}
                />
                <ScenarioMiniCard
                  icon={<BookOpen className="h-4 w-4" />}
                  label={t('scenario_rubric')}
                  value={scenario.rubric.join(' / ')}
                />
                <ScenarioMiniCard
                  icon={<ChevronsUp className="h-4 w-4" />}
                  label={t('scenario_confusions')}
                  value={scenario.expectedConfusions.join(' / ')}
                />
              </div>
            </>
          ) : (
            <div className="grid min-h-52 place-items-center rounded-md border border-foreground/10 bg-background/60 p-6 text-center">
              <div>
                <Sparkles className="mx-auto mb-4 h-6 w-6 text-dynamic-cyan" />
                <p className="text-foreground/65 text-sm leading-6">
                  {t('scenario_empty')}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioMiniCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/70 p-3">
      <div className="flex items-center gap-2 font-mono text-foreground/45 text-xs uppercase tracking-[0.18em]">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-foreground/72 text-sm leading-6">{value}</p>
    </div>
  );
}

export function StudioComposer({
  apiKey,
  audioPreviewUrl,
  audioUploadProgress,
  canGenerate,
  file,
  generatedSpeech,
  isGenerating,
  isGeneratingScenario,
  isSynthesizingSpeech,
  isRecording,
  language,
  onApiKeyChange,
  onClearAudio,
  onFileChange,
  onGenerate,
  onGenerateScenario,
  onLanguageChange,
  onOutputTypeChange,
  onPronunciationModelChange,
  onScenarioModeChange,
  onScenarioPromptChange,
  onStartRecording,
  onStopRecording,
  onSynthesizeSpeech,
  onTargetLanguageChange,
  onTranscriptChange,
  onUseGeneratedSpeech,
  outputType,
  pronunciationModel,
  recordingError,
  scenarioMode,
  scenarioPrompt,
  selectedAudioSource,
  targetLanguage,
  t,
  transcript,
}: {
  apiKey: string;
  audioPreviewUrl?: string;
  audioUploadProgress?: number | null;
  canGenerate: boolean;
  file?: File;
  generatedSpeech?: ValseaClassroomSpeechResponse | null;
  isGenerating: boolean;
  isGeneratingScenario: boolean;
  isSynthesizingSpeech: boolean;
  isRecording: boolean;
  language: string;
  onApiKeyChange: (value: string) => void;
  onClearAudio: () => void;
  onFileChange: (value: File | undefined) => void;
  onGenerate: () => void;
  onGenerateScenario: () => void;
  onLanguageChange: (value: string) => void;
  onOutputTypeChange: (value: string) => void;
  onPronunciationModelChange: (value: string) => void;
  onScenarioModeChange: (value: string) => void;
  onScenarioPromptChange: (value: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSynthesizeSpeech: () => void;
  onTargetLanguageChange: (value: string) => void;
  onTranscriptChange: (value: string) => void;
  onUseGeneratedSpeech: () => void;
  outputType: ValseaClassroomOutputType;
  pronunciationModel: ValseaPronunciationAssessorModel;
  recordingError?: string;
  scenarioMode: string;
  scenarioPrompt: string;
  selectedAudioSource?: AudioSource;
  targetLanguage: string;
  t: ReturnType<typeof useTranslations>;
  transcript: string;
}) {
  return (
    <Card className="valsea-reveal overflow-hidden border-foreground/10 bg-background/80 shadow-[0_24px_70px_-55px_hsl(var(--foreground))] backdrop-blur">
      <CardContent className="space-y-5 p-4 md:p-5">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-dynamic-green text-xs uppercase tracking-[0.2em]">
            <CircleDot className="h-3.5 w-3.5" />
            {t('live_composer')}
          </div>
          <h2 className="text-2xl tracking-tight">{t('composer_title')}</h2>
          <p className="mt-2 text-foreground/60 text-sm leading-6">
            {t('composer_description')}
          </p>
        </div>

        <div className="rounded-md border border-dynamic-cyan/20 bg-dynamic-cyan/5 p-3">
          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
            <SelectField
              id="valsea-scenario-mode"
              label={t('scenario_mode_label')}
              onValueChange={onScenarioModeChange}
              options={SCENARIO_MODES}
              t={t}
              value={scenarioMode}
            />
            <div className="space-y-2">
              <Label htmlFor="valsea-scenario-prompt">
                {t('scenario_prompt_label')}
              </Label>
              <Input
                id="valsea-scenario-prompt"
                onChange={(event) => onScenarioPromptChange(event.target.value)}
                placeholder={t('scenario_prompt_placeholder')}
                value={scenarioPrompt}
              />
            </div>
          </div>
          <Button
            className="mt-3 min-h-11 w-full gap-2 border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan hover:bg-dynamic-cyan/15"
            disabled={isGeneratingScenario}
            onClick={onGenerateScenario}
            type="button"
            variant="outline"
          >
            {isGeneratingScenario ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            {isGeneratingScenario
              ? t('scenario_generating')
              : t('scenario_generate_short')}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="valsea-transcript">{t('transcript_label')}</Label>
          <Textarea
            id="valsea-transcript"
            className="min-h-44 resize-y border-foreground/10 bg-foreground/4 text-base leading-7"
            onChange={(event) => onTranscriptChange(event.target.value)}
            placeholder={t('transcript_placeholder')}
            value={transcript}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            id="valsea-source-language"
            label={t('source_language')}
            onValueChange={onLanguageChange}
            options={INPUT_LANGUAGES}
            t={t}
            value={language}
          />
          <SelectField
            id="valsea-target-language"
            label={t('target_language')}
            onValueChange={onTargetLanguageChange}
            options={TARGET_LANGUAGES}
            t={t}
            value={targetLanguage}
          />
        </div>

        <SelectField
          id="valsea-output-type"
          label={t('artifact_type')}
          onValueChange={onOutputTypeChange}
          options={OUTPUT_TYPES}
          t={t}
          value={outputType}
        />

        <SelectField
          id="valsea-pronunciation-model"
          label={t('pronunciation_model')}
          onValueChange={onPronunciationModelChange}
          options={PRONUNCIATION_MODELS}
          t={t}
          value={pronunciationModel}
        />

        <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/5 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-dynamic-green" />
                {t('generated_voice_title')}
              </Label>
              <p className="mt-1 text-foreground/58 text-xs leading-5">
                {t('generated_voice_hint')}
              </p>
            </div>
            <Badge variant="outline">
              {selectedAudioSource === 'generated'
                ? t('audio_source_selected')
                : t('audio_source_generated')}
            </Badge>
          </div>
          <div className="grid gap-3">
            <Button
              className="min-h-11 gap-2"
              disabled={!transcript.trim() || isSynthesizingSpeech}
              onClick={onSynthesizeSpeech}
              type="button"
              variant="outline"
            >
              {isSynthesizingSpeech ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              {isSynthesizingSpeech
                ? t('generated_voice_synthesizing')
                : t('generated_voice_synthesize')}
            </Button>
            {generatedSpeech ? (
              <div className="rounded-md border border-foreground/10 bg-background/70 p-3">
                <WaveformPreview />
                <audio
                  aria-label={t('generated_voice_preview')}
                  className="mt-3 w-full"
                  controls
                  src={generatedSpeech.previewDataUrl}
                >
                  <track kind="captions" />
                </audio>
                <Button
                  className="mt-3 min-h-10 w-full gap-2"
                  onClick={onUseGeneratedSpeech}
                  type="button"
                >
                  <Play className="h-4 w-4" />
                  {t('generated_voice_use')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
          <AudioCapturePanel
            audioPreviewUrl={audioPreviewUrl}
            file={file}
            isRecording={isRecording}
            onClearAudio={onClearAudio}
            onFileChange={onFileChange}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            recordingError={recordingError}
            t={t}
            uploadProgress={audioUploadProgress}
          />
          <div className="space-y-2">
            <Label htmlFor="valsea-api-key">{t('byok_label')}</Label>
            <Input
              autoComplete="off"
              id="valsea-api-key"
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={t('byok_placeholder')}
              type="password"
              value={apiKey}
            />
            <p className="text-foreground/60 text-xs">{t('byok_short_hint')}</p>
          </div>
        </div>

        <div className="grid grid-flow-dense gap-2 sm:grid-cols-6">
          {SUGGESTED_PROMPTS.map((key) => (
            <Button
              className="sm:col-span-3"
              key={key}
              onClick={() => onTranscriptChange(t(`${key}_text`))}
              type="button"
              variant="outline"
            >
              {t(key)}
            </Button>
          ))}
        </div>

        <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/8 p-2">
          <Button
            className="min-h-12 w-full gap-2 text-base shadow-sm transition-transform duration-300 active:scale-[0.99]"
            disabled={!canGenerate || isGenerating}
            onClick={onGenerate}
            type="button"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="h-4 w-4" />
            )}
            {isGenerating ? t('generating') : t('generate')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectField({
  id,
  label,
  onValueChange,
  options,
  t,
  value,
}: {
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  options: Array<
    | LanguageOption
    | OutputOption
    | PronunciationModelOption
    | ScenarioModeOption
  >;
  t: ReturnType<typeof useTranslations>;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger id={id} className="min-h-11 bg-foreground/4">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WaveformPreview() {
  return (
    <div className="flex h-14 items-end gap-1 rounded-md border border-dynamic-green/20 bg-dynamic-green/5 p-2">
      {Array.from({ length: 34 }, (_, index) => (
        <span
          className="w-full rounded-full bg-dynamic-green/80"
          key={index}
          style={{
            height: `${22 + Math.abs(Math.sin(index * 0.74)) * 66}%`,
          }}
        />
      ))}
    </div>
  );
}

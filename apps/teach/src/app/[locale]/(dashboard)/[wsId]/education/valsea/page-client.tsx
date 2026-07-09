'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  generateValseaClassroomArtifact,
  generateValseaClassroomScenario,
  getValseaClassroomConfig,
  synthesizeValseaClassroomSpeech,
  uploadValseaClassroomAudioToDrive,
  type ValseaClassroomOutputType,
  type ValseaClassroomScenarioResponse,
  type ValseaClassroomSpeechResponse,
  type ValseaPronunciationAssessorModel,
  validateValseaClassroomApiKey,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getTranscriptInsights, type ValseaTranslate } from './insights';
import { ValseaKeyDialog } from './key-dialog';
import { EmptyState, PipelineStrip, ResultsGrid } from './result-panels';
import {
  type AudioSource,
  MissionBrief,
  ScenarioConsole,
  StudioComposer,
  StudioNav,
} from './studio-layout';

const VALSEA_API_KEY_STORAGE_PREFIX = 'tuturuuu:valsea:valsea-api-key';

export function ValseaClassroomClient({ wsId }: { wsId: string }) {
  const t = useTranslations('workspace-education-tabs.valsea');
  const shellRef = useRef<HTMLDivElement>(null);
  const [transcript, setTranscript] = useState(() => t('sample_1_text'));
  const [language, setLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('vietnamese');
  const [outputType, setOutputType] =
    useState<ValseaClassroomOutputType>('action_items');
  const [pronunciationModel, setPronunciationModel] =
    useState<ValseaPronunciationAssessorModel>('local-whisper-large-v3-turbo');
  const [file, setFile] = useState<File | undefined>();
  const [selectedAudioSource, setSelectedAudioSource] = useState<
    AudioSource | undefined
  >();
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | undefined>();
  const [audioUploadProgress, setAudioUploadProgress] = useState<number | null>(
    null
  );
  const [draftApiKey, setDraftApiKey] = useState('');
  const [validatedApiKey, setValidatedApiKey] = useState('');
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [isBrowserKeyHydrated, setIsBrowserKeyHydrated] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | undefined>();
  const [scenario, setScenario] =
    useState<ValseaClassroomScenarioResponse | null>(null);
  const [scenarioMode, setScenarioMode] = useState('surprise');
  const [scenarioPrompt, setScenarioPrompt] = useState('');
  const [generatedSpeech, setGeneratedSpeech] =
    useState<ValseaClassroomSpeechResponse | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const apiKeyStorageKey = `${VALSEA_API_KEY_STORAGE_PREFIX}:${wsId}`;

  const configQuery = useQuery({
    queryFn: () => getValseaClassroomConfig(wsId),
    queryKey: ['valsea-classroom-config', wsId],
  });

  const hasApiKey =
    Boolean(validatedApiKey.trim()) || Boolean(configQuery.data?.hasServerKey);
  const hasSelectedGeneratedAudio =
    selectedAudioSource === 'generated' && Boolean(generatedSpeech);
  const canGenerate =
    file || hasSelectedGeneratedAudio || transcript.trim().length > 0;
  const transcriptInsights = useMemo(
    () =>
      getTranscriptInsights({
        fileName: file?.name,
        language,
        outputType,
        pronunciationModel,
        t: t as unknown as ValseaTranslate,
        targetLanguage,
        transcript,
      }),
    [
      file?.name,
      language,
      outputType,
      pronunciationModel,
      t,
      targetLanguage,
      transcript,
    ]
  );

  const keyValidationMutation = useMutation({
    mutationFn: (key: string) => validateValseaClassroomApiKey(wsId, key),
    onSuccess: (_result, key) => {
      const normalizedKey = key.trim();
      setDraftApiKey(normalizedKey);
      setValidatedApiKey(normalizedKey);
      window.localStorage.setItem(apiKeyStorageKey, normalizedKey);
      setKeyDialogOpen(false);
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      setAudioUploadProgress(file ? 0 : null);
      const audioUpload = file
        ? await uploadValseaClassroomAudioToDrive(wsId, file, {
            onUploadProgress: (progress) =>
              setAudioUploadProgress(progress.percent),
          })
        : null;
      const generatedUpload = hasSelectedGeneratedAudio
        ? {
            fileName: generatedSpeech?.audioFileName,
            path: generatedSpeech?.audioStoragePath,
          }
        : null;

      return generateValseaClassroomArtifact(wsId, {
        apiKey: validatedApiKey.trim() || undefined,
        audioFileName: audioUpload?.fileName ?? generatedUpload?.fileName,
        audioStoragePath: audioUpload?.path ?? generatedUpload?.path,
        language,
        outputType,
        pronunciationModel,
        targetLanguage,
        transcript: transcript.trim() || undefined,
      });
    },
    onError: (error) => {
      setAudioUploadProgress(null);
      const message = error.message.toLowerCase();
      if (
        message.includes('valsea api key') ||
        message.includes('validation failed') ||
        message.includes('unauthorized')
      ) {
        setValidatedApiKey('');
        window.localStorage.removeItem(apiKeyStorageKey);
        setKeyDialogOpen(true);
      }
    },
    onSuccess: () => setAudioUploadProgress(100),
  });

  const scenarioMutation = useMutation({
    mutationFn: () =>
      generateValseaClassroomScenario(wsId, {
        mode: scenarioMode as
          | 'parent_update'
          | 'pronunciation_lab'
          | 'regional_classroom'
          | 'sentiment_lab'
          | 'surprise',
        prompt: scenarioPrompt.trim() || undefined,
        seed: `${Date.now()}-${scenarioMode}-${outputType}-${targetLanguage}`,
      }),
    onSuccess: (nextScenario) => {
      setScenario(nextScenario);
      setTranscript(nextScenario.learnerLine || nextScenario.referencePhrase);
      setLanguage(nextScenario.sourceLanguage);
      setTargetLanguage(nextScenario.targetLanguage);
      setOutputType(nextScenario.outputType);
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
      setAudioPreviewUrl(undefined);
      setAudioUploadProgress(null);
      setRecordingError(undefined);
      setFile(undefined);
      setGeneratedSpeech(null);
      setSelectedAudioSource(undefined);
    },
  });

  const speechMutation = useMutation({
    mutationFn: () =>
      synthesizeValseaClassroomSpeech(wsId, {
        language: scenario?.voice.language || language,
        pace: scenario?.voice.pace ?? 0.9,
        speakerId: scenario?.voice.speakerId,
        text: transcript.trim(),
        voiceId: scenario?.voice.voiceId || 'en_US-lessac-high',
      }),
    onSuccess: (speech) => {
      setGeneratedSpeech(speech);
      setSelectedAudioSource(undefined);
      setAudioUploadProgress(100);
      setRecordingError(undefined);
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
      setAudioPreviewUrl(undefined);
      setFile(undefined);
    },
  });

  useEffect(() => {
    const cachedKey = window.localStorage.getItem(apiKeyStorageKey)?.trim();
    if (cachedKey) {
      setDraftApiKey(cachedKey);
      setValidatedApiKey(cachedKey);
      setKeyDialogOpen(false);
    }
    setIsBrowserKeyHydrated(true);
  }, [apiKeyStorageKey]);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
      recordingStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (!isBrowserKeyHydrated || !configQuery.data) {
      return;
    }

    if (
      !configQuery.data.hasServerKey &&
      !validatedApiKey.trim() &&
      !draftApiKey.trim()
    ) {
      setKeyDialogOpen(true);
    }
  }, [configQuery.data, draftApiKey, isBrowserKeyHydrated, validatedApiKey]);

  useEffect(() => {
    let context: { revert: () => void } | undefined;

    void import('@tuturuuu/ui/gsap').then(({ ScrollTrigger, gsap }) => {
      if (!shellRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.fromTo(
          '.valsea-reveal',
          { opacity: 0, y: 24 },
          {
            duration: 0.7,
            ease: 'power3.out',
            opacity: 1,
            stagger: 0.08,
            y: 0,
          }
        );

        gsap.utils
          .toArray<HTMLElement>('.valsea-stack-card')
          .forEach((card) => {
            gsap.fromTo(
              card,
              { opacity: 0.72, scale: 0.96, y: 24 },
              {
                ease: 'none',
                opacity: 1,
                scale: 1,
                scrollTrigger: {
                  end: 'top 45%',
                  scrub: 0.7,
                  start: 'top 92%',
                  trigger: card,
                },
                y: 0,
              }
            );
          });
      }, shellRef);
    });

    return () => context?.revert();
  }, []);

  const handleGenerate = () => {
    if (draftApiKey.trim() && draftApiKey.trim() !== validatedApiKey.trim()) {
      setKeyDialogOpen(true);
      return;
    }

    if (!hasApiKey) {
      setKeyDialogOpen(true);
      return;
    }
    mutation.mutate();
  };

  const handleApiKeyChange = (value: string) => {
    setDraftApiKey(value);
    keyValidationMutation.reset();
    if (value.trim() !== validatedApiKey.trim()) {
      setValidatedApiKey('');
    }
  };

  const handleKeySubmit = () => {
    const trimmedKey = draftApiKey.trim();
    if (!trimmedKey) return;
    keyValidationMutation.mutate(trimmedKey);
  };

  const handleAudioFileChange = (
    nextFile: File | undefined,
    source: AudioSource = 'uploaded'
  ) => {
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setAudioPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : undefined);
    setAudioUploadProgress(null);
    setRecordingError(undefined);
    setFile(nextFile);
    setSelectedAudioSource(nextFile ? source : undefined);
  };

  const handleStartRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError(t('audio_recording_unsupported'));
      return;
    }

    try {
      setRecordingError(undefined);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      const preferredMimeType = 'audio/webm;codecs=opus';
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(preferredMimeType)
          ? preferredMimeType
          : 'audio/webm',
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const recordedFile = new File(
          [blob],
          `valsea-live-${new Date().toISOString().replaceAll(':', '-')}.webm`,
          { type: blob.type || 'audio/webm' }
        );
        handleAudioFileChange(recordedFile, 'recorded');
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : t('audio_recording_failed')
      );
      recordingStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleUseGeneratedSpeech = () => {
    if (!generatedSpeech) return;
    setSelectedAudioSource('generated');
    setFile(undefined);
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setAudioPreviewUrl(undefined);
    setAudioUploadProgress(100);
  };

  return (
    <main
      ref={shellRef}
      className="min-h-[100dvh] w-full max-w-full overflow-x-hidden rounded-md border border-foreground/10 bg-background p-3 text-foreground sm:p-5"
    >
      <ValseaKeyDialog
        apiKey={draftApiKey}
        isValidating={keyValidationMutation.isPending}
        onApiKeyChange={handleApiKeyChange}
        onOpenChange={setKeyDialogOpen}
        onSubmit={handleKeySubmit}
        open={keyDialogOpen}
        t={t}
        validationError={keyValidationMutation.error?.message}
      />

      <div className="mx-auto flex max-w-[1720px] flex-col gap-5">
        <StudioNav
          hasApiKey={hasApiKey}
          isConfigLoading={configQuery.isLoading}
          onOpenKeyDialog={() => setKeyDialogOpen(true)}
          t={t}
        />

        <MissionBrief
          hasApiKey={hasApiKey}
          insights={transcriptInsights}
          scenario={scenario}
          t={t}
        />

        <section className="grid gap-5 xl:grid-cols-[minmax(340px,500px)_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-4 xl:self-start">
            <StudioComposer
              apiKey={draftApiKey}
              audioPreviewUrl={audioPreviewUrl}
              audioUploadProgress={audioUploadProgress}
              file={file}
              generatedSpeech={generatedSpeech}
              isGenerating={mutation.isPending}
              isGeneratingScenario={scenarioMutation.isPending}
              isSynthesizingSpeech={speechMutation.isPending}
              isRecording={isRecording}
              language={language}
              onApiKeyChange={handleApiKeyChange}
              onClearAudio={() => handleAudioFileChange(undefined)}
              onFileChange={handleAudioFileChange}
              onGenerate={handleGenerate}
              onGenerateScenario={() => scenarioMutation.mutate()}
              onLanguageChange={setLanguage}
              onOutputTypeChange={(value) =>
                setOutputType(value as ValseaClassroomOutputType)
              }
              onPronunciationModelChange={(value) =>
                setPronunciationModel(value as ValseaPronunciationAssessorModel)
              }
              onScenarioModeChange={setScenarioMode}
              onScenarioPromptChange={setScenarioPrompt}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              onSynthesizeSpeech={() => speechMutation.mutate()}
              onTargetLanguageChange={setTargetLanguage}
              onTranscriptChange={setTranscript}
              onUseGeneratedSpeech={handleUseGeneratedSpeech}
              outputType={outputType}
              pronunciationModel={pronunciationModel}
              recordingError={recordingError}
              scenarioMode={scenarioMode}
              scenarioPrompt={scenarioPrompt}
              selectedAudioSource={selectedAudioSource}
              targetLanguage={targetLanguage}
              t={t}
              transcript={transcript}
              canGenerate={Boolean(canGenerate)}
            />
          </div>

          <div className="grid gap-5 xl:min-h-[70dvh]">
            <ScenarioConsole
              isGenerating={scenarioMutation.isPending}
              onGenerate={() => scenarioMutation.mutate()}
              scenario={scenario}
              t={t}
            />
            {scenarioMutation.error ? (
              <div className="valsea-reveal rounded-md border border-dynamic-red/25 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
                {scenarioMutation.error.message}
              </div>
            ) : null}
            {speechMutation.error ? (
              <div className="valsea-reveal rounded-md border border-dynamic-red/25 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
                {speechMutation.error.message}
              </div>
            ) : null}
            <PipelineStrip
              hasApiKey={hasApiKey}
              isLoading={mutation.isPending}
              t={t}
            />
            {mutation.error ? (
              <div className="valsea-reveal rounded-md border border-dynamic-red/25 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
                {mutation.error.message}
              </div>
            ) : null}
            {mutation.data ? (
              <ResultsGrid result={mutation.data} t={t} />
            ) : (
              <EmptyState
                hasApiKey={hasApiKey}
                onOpenKeyDialog={() => setKeyDialogOpen(true)}
                t={t}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

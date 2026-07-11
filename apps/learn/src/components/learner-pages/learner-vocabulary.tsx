'use client';

import { BookOpen } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContentCard } from './content-card';
import { LearnerVocabularyMatch } from './learner-vocabulary-match';
import {
  LearnerVocabularyLoading,
  LearnerVocabularyPracticeHeader,
} from './learner-vocabulary-practice-header';
import { LearnerVocabularyPronunciationFeedback } from './learner-vocabulary-pronunciation-feedback';
import { LearnerVocabularyQuizResults } from './learner-vocabulary-quiz-results';
import { LearnerVocabularyReview } from './learner-vocabulary-review';
import {
  blobToBase64,
  buildCards,
  buildQuizOptions,
  type MatchCard,
  normalizeVocabulary,
  type PronunciationFeedback,
  type VocabularyEntry,
} from './learner-vocabulary-utils';
import { useVocabularySpeech } from './use-vocabulary-speech';

export function LearnerVocabulary({ moduleId }: { moduleId: string }) {
  const t = useTranslations('learnerVocabulary');
  const params = useParams<{ wsId?: string }>();
  const wsId = params?.wsId;
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [selected, setSelected] = useState<MatchCard | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const { playSpeech, playingKey } = useVocabularySpeech();

  // Quiz/Flashcard State
  const [practiceMode, setPracticeMode] = useState<
    'match' | 'pronunciation' | 'quiz' | null
  >(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizSelectedOption, setQuizSelectedOption] = useState<string | null>(
    null
  );
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [pronunciationIndex, setPronunciationIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzingPronunciation, setIsAnalyzingPronunciation] =
    useState(false);
  const [pronunciationError, setPronunciationError] = useState<string | null>(
    null
  );
  const [pronunciationFeedback, setPronunciationFeedback] =
    useState<PronunciationFeedback | null>(null);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState<string | null>(
    null
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingPreviewUrlRef = useRef<string | null>(null);

  const matchedSet = useMemo(() => new Set(matchedIds), [matchedIds]);
  const finished = cards.length > 0 && matchedIds.length === cards.length;

  useEffect(() => {
    if (!wsId) return;

    let cancelled = false;

    async function loadVocabulary() {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/course-modules/${moduleId}/vocabulary`,
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to load vocabulary.');
        }

        const payload = (await response.json()) as { vocabulary?: unknown };

        if (!cancelled) {
          setVocabulary(normalizeVocabulary(payload.vocabulary));
        }
      } catch (error) {
        console.error('Failed to load learner vocabulary', error);
        if (!cancelled) {
          setVocabulary([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadVocabulary();

    return () => {
      cancelled = true;
    };
  }, [moduleId, wsId]);

  const pronunciationItems = useMemo(
    () =>
      vocabulary
        .map((entry) => ({
          entry,
          sentence: entry.examples[0] ?? entry.definition,
        }))
        .filter((item) => item.sentence.trim().length > 0),
    [vocabulary]
  );

  function startPractice(mode: 'match' | 'pronunciation' | 'quiz') {
    setPracticeMode(mode);
    if (mode === 'match') {
      setCards(buildCards(vocabulary));
      setMatchedIds([]);
      setMismatchIds([]);
      setSelected(null);
    } else if (mode === 'quiz') {
      setQuizIndex(0);
      setQuizCorrectCount(0);
      setQuizSelectedOption(null);
      setQuizAnswered(false);
      setQuizOptions(buildQuizOptions(0, vocabulary));
    } else {
      setPronunciationIndex(0);
      setPronunciationFeedback(null);
      setPronunciationError(null);
    }
    setStarted(true);
  }

  function cancelActiveRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.ondataavailable = null;
    recorder.onstop = null;

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    recorder.stream.getTracks().forEach((track) => {
      track.stop();
    });
    mediaRecorderRef.current = null;
  }

  function resetPractice() {
    cancelActiveRecording();
    if (recordingPreviewUrl) {
      URL.revokeObjectURL(recordingPreviewUrl);
    }
    setStarted(false);
    setPracticeMode(null);
    setCards([]);
    setMatchedIds([]);
    setMismatchIds([]);
    setSelected(null);
    setQuizIndex(0);
    setQuizCorrectCount(0);
    setQuizSelectedOption(null);
    setQuizAnswered(false);
    setPronunciationIndex(0);
    setIsRecording(false);
    setIsAnalyzingPronunciation(false);
    setPronunciationError(null);
    setPronunciationFeedback(null);
    setRecordingPreviewUrl(null);
  }

  async function analyzePronunciation(blob: Blob, targetText: string) {
    try {
      setIsAnalyzingPronunciation(true);
      setPronunciationError(null);
      setPronunciationFeedback(null);

      const audioData = await blobToBase64(blob);
      const response = await fetch('/api/v1/vocabulary/pronunciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          audioData,
          mimeType: blob.type || 'audio/webm',
          targetText,
        }),
      });

      if (!response.ok) {
        throw new Error('Could not analyze pronunciation.');
      }

      const payload = (await response.json()) as PronunciationFeedback;
      setPronunciationFeedback({
        issues: Array.isArray(payload.issues) ? payload.issues : [],
        mistakes: Array.isArray(payload.mistakes) ? payload.mistakes : [],
        score: typeof payload.score === 'number' ? payload.score : null,
        summary: payload.summary || t('pronunciationChecked'),
        tips: Array.isArray(payload.tips) ? payload.tips : [],
        transcript: payload.transcript || '',
      });
    } catch (error) {
      console.error('Failed to analyze pronunciation', error);
      setPronunciationError(t('analysisFailed'));
    } finally {
      setIsAnalyzingPronunciation(false);
    }
  }

  async function startRecording(targetText: string) {
    try {
      setPronunciationError(null);
      setPronunciationFeedback(null);
      if (recordingPreviewUrl) {
        URL.revokeObjectURL(recordingPreviewUrl);
      }
      setRecordingPreviewUrl(null);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        setRecordingPreviewUrl(URL.createObjectURL(audioBlob));
        void analyzePronunciation(audioBlob, targetText);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start pronunciation recording', error);
      setPronunciationError(t('microphoneRequired'));
      setIsRecording(false);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
  }

  useEffect(() => {
    recordingPreviewUrlRef.current = recordingPreviewUrl;
  }, [recordingPreviewUrl]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      recorder?.stream.getTracks().forEach((track) => {
        track.stop();
      });

      const previewUrl = recordingPreviewUrlRef.current;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  function nextPronunciationPrompt() {
    cancelActiveRecording();
    setIsRecording(false);
    setPronunciationFeedback(null);
    setPronunciationError(null);
    if (recordingPreviewUrl) {
      URL.revokeObjectURL(recordingPreviewUrl);
    }
    setRecordingPreviewUrl(null);
    setPronunciationIndex((current) =>
      Math.min(current + 1, Math.max(0, pronunciationItems.length - 1))
    );
  }

  function selectCard(card: MatchCard) {
    if (matchedSet.has(card.id)) return;

    if (!selected) {
      setSelected(card);
      return;
    }

    if (selected.id === card.id) {
      setSelected(null);
      return;
    }

    const isMatch =
      selected.entryId === card.entryId && selected.side !== card.side;

    if (isMatch) {
      setMatchedIds((current) => [...current, selected.id, card.id]);
      setSelected(null);
      return;
    }

    setMismatchIds([selected.id, card.id]);
    window.setTimeout(() => {
      setMismatchIds([]);
      setSelected(null);
    }, 650);
  }

  function selectQuizOption(option: string) {
    if (quizAnswered) return;
    setQuizSelectedOption(option);
    setQuizAnswered(true);

    const currentEntry = vocabulary[quizIndex];
    if (currentEntry && option === currentEntry.word) {
      setQuizCorrectCount((c) => c + 1);
    }
  }

  function nextQuizQuestion() {
    const nextIndex = quizIndex + 1;
    setQuizIndex(nextIndex);
    setQuizSelectedOption(null);
    setQuizAnswered(false);
    if (nextIndex < vocabulary.length) {
      setQuizOptions(buildQuizOptions(nextIndex, vocabulary));
    }
  }

  return (
    <ContentCard
      icon={<BookOpen className="h-4 w-4" />}
      title={t('title', { count: vocabulary.length })}
    >
      {isLoading ? (
        <LearnerVocabularyLoading />
      ) : vocabulary.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : !started ? (
        <LearnerVocabularyReview
          playSpeech={playSpeech}
          playingKey={playingKey}
          startPractice={startPractice}
          vocabulary={vocabulary}
        />
      ) : practiceMode === 'pronunciation' ? (
        <div className="space-y-4">
          <LearnerVocabularyPracticeHeader
            label={t('pronunciationProgress', {
              current: pronunciationIndex + 1,
              total: Math.max(pronunciationItems.length, 1),
            })}
            resetPractice={resetPractice}
          />

          {pronunciationItems.length === 0 ? (
            <div className="border-2 border-border bg-background p-6 text-muted-foreground text-sm shadow-[4px_4px_0_var(--border)]">
              {t('pronunciationEmpty')}
            </div>
          ) : (
            (() => {
              const item = pronunciationItems[pronunciationIndex];
              if (!item) return null;

              return (
                <div className="space-y-5 border-2 border-border bg-background p-6 shadow-[4px_4px_0_var(--border)]">
                  <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
                    {item.entry.imageUrl ? (
                      <Image
                        alt={t('imageAlt', { word: item.entry.word })}
                        className="aspect-video w-full border-2 border-border object-cover shadow-[3px_3px_0_var(--border)] md:aspect-square"
                        height={320}
                        unoptimized
                        referrerPolicy="no-referrer"
                        src={item.entry.imageUrl}
                        width={320}
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center border-2 border-border border-dashed bg-muted/20 text-muted-foreground text-xs shadow-[3px_3px_0_var(--border)] md:aspect-square">
                        {t('noImage')}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <p className="font-black text-2xl">{item.entry.word}</p>
                        {item.entry.pronunciation ? (
                          <p className="text-muted-foreground text-sm">
                            {item.entry.pronunciation}
                          </p>
                        ) : null}
                      </div>

                      <div className="border-2 border-border bg-card p-4 shadow-[2px_2px_0_var(--border)]">
                        <p className="mb-2 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                          {t('readSentence')}
                        </p>
                        <p className="text-base leading-relaxed">
                          {item.sentence}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
                          disabled={playingKey !== null}
                          onClick={() =>
                            playSpeech(
                              item.sentence,
                              'example',
                              `${item.entry.id}-pronunciation-target`
                            )
                          }
                          type="button"
                        >
                          {playingKey ===
                          `${item.entry.id}-pronunciation-target`
                            ? t('playing')
                            : t('playTarget')}
                        </button>
                        <button
                          className="border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
                          disabled={isAnalyzingPronunciation}
                          onClick={() =>
                            isRecording
                              ? stopRecording()
                              : startRecording(item.sentence)
                          }
                          type="button"
                        >
                          {isRecording
                            ? t('stopRecording')
                            : t('startRecording')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isRecording ? (
                    <p className="border-2 border-dynamic-yellow/50 bg-dynamic-yellow/10 p-3 font-bold text-sm shadow-[2px_2px_0_var(--border)]">
                      {t('recording')}
                    </p>
                  ) : null}

                  {isAnalyzingPronunciation ? (
                    <p className="text-muted-foreground text-sm">
                      {t('checkingPronunciation')}
                    </p>
                  ) : null}

                  {recordingPreviewUrl ? (
                    <div className="space-y-2 border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)]">
                      <p className="font-bold text-xs uppercase tracking-widest">
                        {t('yourRecording')}
                      </p>
                      <audio
                        className="w-full"
                        controls
                        src={recordingPreviewUrl}
                      />
                    </div>
                  ) : null}

                  {pronunciationError ? (
                    <p className="text-destructive text-sm">
                      {pronunciationError}
                    </p>
                  ) : null}

                  {pronunciationFeedback ? (
                    <LearnerVocabularyPronunciationFeedback
                      feedback={pronunciationFeedback}
                      sentence={item.sentence}
                    />
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      className="border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
                      disabled={
                        pronunciationIndex + 1 >= pronunciationItems.length
                      }
                      onClick={nextPronunciationPrompt}
                      type="button"
                    >
                      {t('nextSentence')}
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      ) : practiceMode === 'quiz' ? (
        <div className="space-y-4">
          <LearnerVocabularyPracticeHeader
            label={
              quizIndex < vocabulary.length
                ? t('questionProgress', {
                    current: quizIndex + 1,
                    total: vocabulary.length,
                  })
                : t('quizComplete')
            }
            resetPractice={resetPractice}
          />

          {quizIndex < vocabulary.length ? (
            (() => {
              const entry = vocabulary[quizIndex];
              if (!entry) return null;
              return (
                <div className="space-y-6 border-2 border-border bg-background p-6 shadow-[4px_4px_0_var(--border)]">
                  {entry.imageUrl ? (
                    <div className="mx-auto flex max-w-md justify-center overflow-hidden border-2 border-border bg-muted/20 shadow-[2px_2px_0_var(--border)]">
                      <Image
                        alt={t('quizClueAlt')}
                        className="max-h-64 w-full object-contain"
                        height={320}
                        unoptimized
                        referrerPolicy="no-referrer"
                        src={entry.imageUrl}
                        width={512}
                      />
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center border-2 border-border border-dashed bg-muted/10 text-muted-foreground text-xs">
                      {t('noImageClue')}
                    </div>
                  )}

                  <div className="space-y-2 text-center">
                    {entry.pronunciation ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <p className="font-serif text-lg text-muted-foreground tracking-wide">
                          {entry.pronunciation}
                        </p>
                        {quizAnswered && (
                          <button
                            className="inline-flex items-center gap-1 rounded border-2 border-border bg-card px-2 py-0.5 font-bold text-xs shadow-[1.5px_1.5px_0_var(--border)] hover:bg-muted/30 disabled:opacity-50"
                            disabled={playingKey !== null}
                            onClick={() =>
                              playSpeech(
                                entry.word,
                                'word',
                                `${entry.id}-quiz-word`
                              )
                            }
                            type="button"
                          >
                            {playingKey === `${entry.id}-quiz-word`
                              ? t('playing')
                              : t('playVoice')}
                          </button>
                        )}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <p className="font-medium text-base italic leading-relaxed">
                        "{entry.definition}"
                      </p>
                      <button
                        className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-xs shadow-[1px_1px_0_var(--border)] hover:bg-muted/30 disabled:opacity-50"
                        disabled={playingKey !== null}
                        onClick={() =>
                          playSpeech(
                            entry.definition,
                            'example',
                            `${entry.id}-quiz-def`
                          )
                        }
                        type="button"
                      >
                        {playingKey === `${entry.id}-quiz-def`
                          ? t('playing')
                          : t('playClue')}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {quizOptions.map((option) => {
                      const isCorrectOption = option === entry.word;
                      const isSelectedOption = option === quizSelectedOption;

                      let optionStyle =
                        'border-border bg-background shadow-[3px_3px_0_var(--border)] hover:bg-muted/30';
                      if (quizAnswered) {
                        if (isCorrectOption) {
                          optionStyle =
                            'border-dynamic-green/70 bg-dynamic-green/10 text-dynamic-green shadow-[3px_3px_0_var(--border)] font-bold';
                        } else if (isSelectedOption) {
                          optionStyle =
                            'border-destructive/70 bg-destructive/10 text-destructive shadow-[3px_3px_0_var(--border)] font-bold';
                        } else {
                          optionStyle =
                            'border-border bg-background/50 opacity-60 shadow-[1px_1px_0_var(--border)]';
                        }
                      }

                      return (
                        <button
                          key={option}
                          className={cn(
                            'min-h-16 border-2 px-4 text-left font-bold text-sm transition-all',
                            optionStyle
                          )}
                          disabled={quizAnswered}
                          onClick={() => selectQuizOption(option)}
                          type="button"
                        >
                          <span className="mb-1 block text-[10px] text-muted-foreground uppercase tracking-widest">
                            {t('choice')}
                          </span>
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {quizAnswered && (
                    <div className="flex justify-end pt-2">
                      <button
                        className="inline-flex items-center gap-2 border-2 border-border bg-primary px-5 py-2.5 font-black text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                        onClick={nextQuizQuestion}
                        type="button"
                      >
                        {quizIndex + 1 === vocabulary.length
                          ? t('viewResults')
                          : t('nextQuestion')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <LearnerVocabularyQuizResults
              correctCount={quizCorrectCount}
              resetPractice={resetPractice}
              restartQuiz={() => startPractice('quiz')}
              total={vocabulary.length}
            />
          )}
        </div>
      ) : practiceMode === 'match' ? (
        <LearnerVocabularyMatch
          cards={cards}
          finished={finished}
          matchedIds={matchedIds}
          matchedSet={matchedSet}
          mismatchIds={mismatchIds}
          resetPractice={resetPractice}
          selectCard={selectCard}
          selected={selected}
          vocabularyCount={vocabulary.length}
        />
      ) : null}
    </ContentCard>
  );
}

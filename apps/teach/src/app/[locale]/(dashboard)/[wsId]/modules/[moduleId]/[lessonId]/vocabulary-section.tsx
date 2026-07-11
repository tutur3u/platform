'use client';

import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  emptyVocabulary,
  normalizeVocabulary,
  readImageAsDataUrl,
  type VocabularyItem,
  type VocabularySectionProps,
  type VocabularySuggestion,
} from '@/components/vocabulary/vocabulary-form-utils';
import { VocabularySectionIntro } from '@/components/vocabulary/vocabulary-section-intro';

export default function LessonVocabularySection({
  wsId,
  moduleId,
}: VocabularySectionProps) {
  const t = useTranslations('teachVocabulary');
  const [entries, setEntries] = useState<VocabularyItem[]>([]);
  const [draft, setDraft] = useState<VocabularyItem>(emptyVocabulary());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<VocabularySuggestion[]>([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [searchedImages, setSearchedImages] = useState<
    Array<{ image: string; thumbnail: string; title: string }>
  >([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);

  const exampleLines = draft.examples.length > 0 ? draft.examples : [''];

  useEffect(() => {
    let cancelled = false;

    async function loadVocabulary() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/workspaces/${wsId}/course-modules/${moduleId}/vocabulary`,
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to load vocabulary.');
        }

        const payload = (await response.json()) as
          | { vocabulary?: unknown; data?: { vocabulary?: unknown } }
          | undefined;

        if (cancelled) return;

        setEntries(
          normalizeVocabulary(payload?.vocabulary ?? payload?.data?.vocabulary)
        );
      } catch (loadError) {
        if (cancelled) return;

        console.error('Failed to load lesson vocabulary', loadError);
        setError(t('loadFailed'));
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
  }, [moduleId, t, wsId]);

  useEffect(() => {
    const query = draft.word.trim();

    if (query.length < 2) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setIsSuggesting(true);
        const response = await fetch(
          `/api/v1/vocabulary/suggestions?q=${encodeURIComponent(query)}`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const payload = (await response.json()) as {
          suggestions?: VocabularySuggestion[];
        };
        setSuggestions(payload.suggestions ?? []);
      } catch (suggestionError) {
        if (!controller.signal.aborted) {
          console.error(
            'Failed to load vocabulary suggestions',
            suggestionError
          );
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSuggesting(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [draft.word]);

  async function persistVocabulary(nextEntries: VocabularyItem[]) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/course-modules/${moduleId}/vocabulary`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            vocabulary: nextEntries,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save vocabulary.');
      }

      setEntries(nextEntries);
      setDraft(emptyVocabulary());
      setEditingId(null);
      setSearchedImages([]);
    } catch (saveError) {
      console.error('Failed to save lesson vocabulary', saveError);
      setError(t('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  function resetForm() {
    setDraft(emptyVocabulary());
    setEditingId(null);
    setError(null);
    setSearchedImages([]);
  }

  function updateDraft(field: keyof VocabularyItem, value: string | string[]) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function searchImageSuggestions(word: string) {
    const query = word.trim();
    if (!query) return;

    setIsSearchingImages(true);
    try {
      const response = await fetch(
        `/api/v1/vocabulary/images?q=${encodeURIComponent(query)}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch images');
      const payload = await response.json();
      setSearchedImages(payload.results ?? []);
    } catch (err) {
      console.error('Failed to load image suggestions:', err);
    } finally {
      setIsSearchingImages(false);
    }
  }

  async function fetchDictionaryDetails(word: string) {
    setIsFetchingDetails(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('word', word);

      const response = await fetch(
        `/api/v1/vocabulary/details?${params.toString()}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        return;
      }

      const details = await response.json();

      setDraft((current) => {
        const nextExamples =
          details.examples && details.examples.length > 0
            ? details.examples
            : current.examples;

        return {
          ...current,
          word: details.word || current.word,
          pronunciation: details.pronunciation || current.pronunciation,
          definition: details.definition || current.definition,
          examples: nextExamples,
        };
      });

      const searchWord = details.word || word;
      if (searchWord) {
        searchImageSuggestions(searchWord);
      }
    } catch (fetchError) {
      console.error('Failed to load dictionary details', fetchError);
      setError(t('detailsFailed'));
    } finally {
      setIsFetchingDetails(false);
    }
  }

  function selectSuggestion(suggestion: VocabularySuggestion) {
    updateDraft('word', suggestion.word);
    if (suggestion.definition) {
      updateDraft('definition', suggestion.definition);
    }
    setShowSuggestions(false);
    fetchDictionaryDetails(suggestion.word);
  }

  async function handleImageUpload(file: File | null) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('imageFileRequired'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('imageTooLarge'));
      return;
    }

    try {
      const imageUrl = await readImageAsDataUrl(file);
      updateDraft('imageUrl', imageUrl);
      setError(null);
    } catch {
      setError(t('imageUploadFailed'));
    }
  }

  function updateExampleLine(index: number, value: string) {
    setDraft((current) => {
      const examples =
        current.examples.length > 0 ? [...current.examples] : [''];
      examples[index] = value;

      return {
        ...current,
        examples,
      };
    });
  }

  function addExampleLine() {
    setDraft((current) => ({
      ...current,
      examples:
        current.examples.length > 0 ? [...current.examples, ''] : ['', ''],
    }));
  }

  function removeExampleLine(index: number) {
    setDraft((current) => ({
      ...current,
      examples: current.examples.filter(
        (_, currentIndex) => currentIndex !== index
      ),
    }));
  }

  async function handleSubmit() {
    const word = draft.word.trim();
    const definition = draft.definition.trim();
    const pronunciation = draft.pronunciation.trim();
    const examples = draft.examples
      .map((example) => example.trim())
      .filter(Boolean);

    if (!word || !definition) {
      setError(t('requiredFields'));
      return;
    }

    const nextEntry: VocabularyItem = {
      id: editingId ?? crypto.randomUUID(),
      word,
      pronunciation,
      definition,
      examples,
      imageUrl: draft.imageUrl,
    };

    const nextEntries = editingId
      ? entries.map((entry) => (entry.id === editingId ? nextEntry : entry))
      : [...entries, nextEntry];

    await persistVocabulary(nextEntries);
  }

  async function handleDelete(id: string) {
    await persistVocabulary(entries.filter((entry) => entry.id !== id));
  }

  function handleEdit(entry: VocabularyItem) {
    setEditingId(entry.id);
    setDraft(entry);
    setError(null);
    if (entry.word.trim()) {
      searchImageSuggestions(entry.word.trim());
    }
  }

  return (
    <section className="mt-8 space-y-4 border-2 border-border bg-background p-6 shadow-[5px_5px_0_var(--border)]">
      <div className="flex items-center justify-between gap-4">
        <VocabularySectionIntro count={entries.length} />
      </div>

      <Separator className="border-border border-b-2" />

      <div className="space-y-4 border-2 border-border bg-card p-5 shadow-[4px_4px_0_var(--border)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lesson-vocabulary-word">{t('word')}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  autoComplete="off"
                  id="lesson-vocabulary-word"
                  value={draft.word}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 150);
                  }}
                  onChange={(event) => {
                    updateDraft('word', event.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder={t('wordPlaceholder')}
                />

                {showSuggestions &&
                (isSuggesting || suggestions.length > 0) &&
                draft.word.trim().length >= 2 ? (
                  <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto border-2 border-border bg-card shadow-[4px_4px_0_var(--border)]">
                    {isSuggesting ? (
                      <div className="px-3 py-2 text-muted-foreground text-sm">
                        {t('loadingSuggestions')}
                      </div>
                    ) : (
                      suggestions.map((suggestion) => (
                        <button
                          className="flex w-full items-center justify-between gap-3 border-border border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                          key={`${suggestion.word}-${suggestion.url}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSuggestion(suggestion)}
                          type="button"
                        >
                          <span>
                            <span className="block font-bold">
                              {suggestion.word}
                            </span>
                            {suggestion.definition ? (
                              <span className="line-clamp-1 text-muted-foreground text-xs">
                                {suggestion.definition}
                              </span>
                            ) : null}
                          </span>
                          {suggestion.beta ? (
                            <span className="text-[10px] text-muted-foreground uppercase">
                              {t('beta')}
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <button
                className="shrink-0 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-40"
                disabled={isSaving || isFetchingDetails || !draft.word.trim()}
                onClick={() => fetchDictionaryDetails(draft.word.trim())}
                type="button"
              >
                {isFetchingDetails ? t('fetching') : t('fetch')}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lesson-vocabulary-pronunciation">
              {t('pronunciation')}
            </Label>
            <Input
              id="lesson-vocabulary-pronunciation"
              value={draft.pronunciation}
              onChange={(event) =>
                updateDraft('pronunciation', event.target.value)
              }
              placeholder={t('pronunciationPlaceholder')}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="lesson-vocabulary-definition">
            {t('definition')}
          </Label>
          <Textarea
            id="lesson-vocabulary-definition"
            value={draft.definition}
            onChange={(event) => updateDraft('definition', event.target.value)}
            placeholder={t('definitionPlaceholder')}
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="lesson-vocabulary-image">{t('image')}</Label>
          <div className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="flex aspect-video items-center justify-center overflow-hidden border-2 border-border bg-background shadow-[3px_3px_0_var(--border)]">
              {draft.imageUrl ? (
                <Image
                  alt={t('imageAlt', { word: draft.word || t('word') })}
                  className="h-full w-full object-cover"
                  height={180}
                  unoptimized
                  src={draft.imageUrl}
                  width={320}
                />
              ) : (
                <span className="px-3 text-center text-muted-foreground text-xs">
                  {t('noImage')}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <Input
                accept="image/*"
                id="lesson-vocabulary-image"
                onChange={(event) =>
                  handleImageUpload(event.target.files?.[0] ?? null)
                }
                type="file"
              />
              {draft.imageUrl ? (
                <button
                  className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                  disabled={isSaving}
                  onClick={() => updateDraft('imageUrl', '')}
                  type="button"
                >
                  {t('removeImage')}
                </button>
              ) : null}

              {/* Related Images Selector */}
              {isSearchingImages ? (
                <div className="animate-pulse text-muted-foreground text-xs">
                  {t('searchingImages')}
                </div>
              ) : searchedImages.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <span className="font-semibold text-muted-foreground text-xs">
                    {t('selectRelatedImage')}
                  </span>
                  <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-2">
                    {searchedImages.map((img) => (
                      <button
                        key={img.image}
                        type="button"
                        onClick={() => updateDraft('imageUrl', img.thumbnail)}
                        className={`relative aspect-square w-16 shrink-0 overflow-hidden border-2 transition-all hover:scale-105 ${
                          draft.imageUrl === img.thumbnail
                            ? 'scale-105 border-primary shadow-[2px_2px_0_var(--border)] ring-2 ring-primary/20'
                            : 'border-border shadow-[1px_1px_0_var(--border)]'
                        }`}
                        title={img.title}
                      >
                        <Image
                          alt={img.title}
                          className="h-full w-full object-cover"
                          height={64}
                          unoptimized
                          referrerPolicy="no-referrer"
                          src={img.thumbnail}
                          width={64}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="lesson-vocabulary-example-0">{t('examples')}</Label>
            <button
              className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              disabled={isSaving || draft.examples.length >= 20}
              onClick={addExampleLine}
              type="button"
            >
              {t('addExample')}
            </button>
          </div>

          <div className="space-y-2">
            {exampleLines.map((example, index) => (
              <div
                className="grid gap-2 sm:grid-cols-[1fr_auto]"
                key={`lesson-vocabulary-example-${index}`}
              >
                <Input
                  id={`lesson-vocabulary-example-${index}`}
                  value={example}
                  onChange={(event) =>
                    updateExampleLine(index, event.target.value)
                  }
                  placeholder={t('examplePlaceholder', { number: index + 1 })}
                />

                {draft.examples.length > 1 || example ? (
                  <button
                    className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                    disabled={isSaving}
                    onClick={() => removeExampleLine(index)}
                    type="button"
                  >
                    {t('remove')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
            onClick={handleSubmit}
            disabled={isSaving}
            type="button"
          >
            {isSaving
              ? t('saving')
              : editingId
                ? t('saveChanges')
                : t('addVocabulary')}
          </button>

          {(editingId ||
            draft.word ||
            draft.definition ||
            draft.pronunciation ||
            draft.imageUrl ||
            draft.examples.length > 0) && (
            <button
              className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              onClick={resetForm}
              disabled={isSaving}
              type="button"
            >
              {t('cancel')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="space-y-4 border-2 border-border bg-card p-5 shadow-[4px_4px_0_var(--border)]"
            >
              <div className="space-y-1">
                {entry.imageUrl ? (
                  <Image
                    alt={t('imageAlt', { word: entry.word })}
                    className="aspect-video w-full border-2 border-border object-cover shadow-[3px_3px_0_var(--border)]"
                    height={360}
                    unoptimized
                    src={entry.imageUrl}
                    width={640}
                  />
                ) : null}
                <h3 className="font-black text-base">{entry.word}</h3>
                {entry.pronunciation ? (
                  <p className="text-muted-foreground text-sm">
                    {entry.pronunciation}
                  </p>
                ) : null}
              </div>

              <p className="text-sm">{entry.definition}</p>

              {entry.examples.length > 0 ? (
                <div className="space-y-2">
                  <p className="font-bold text-xs uppercase tracking-wide">
                    {t('examples')}
                  </p>
                  <ul className="space-y-1 text-sm">
                    {entry.examples.map((example, index) => (
                      <li key={`${entry.id}-example-${index}`}>• {example}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
                  onClick={() => handleEdit(entry)}
                  type="button"
                >
                  {t('edit')}
                </button>
                <button
                  className="border-2 border-destructive bg-destructive px-3 py-1.5 font-bold text-destructive-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                  onClick={() => handleDelete(entry.id)}
                  disabled={isSaving}
                  type="button"
                >
                  {t('delete')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

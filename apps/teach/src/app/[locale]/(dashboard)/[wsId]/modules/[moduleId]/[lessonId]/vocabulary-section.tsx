'use client';

import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useEffect, useState } from 'react';

interface Props {
  wsId: string;
  lessonId: string;
}

interface VocabularyItem {
  id: string;
  word: string;
  pronunciation: string;
  definition: string;
  examples: string[];
}

function emptyVocabulary(): VocabularyItem {
  return {
    id: '',
    word: '',
    pronunciation: '',
    definition: '',
    examples: [],
  };
}

function normalizeVocabulary(value: unknown): VocabularyItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const record = entry as Record<string, unknown>;
      const word =
        typeof record.word === 'string' ? record.word.trim() : '';
      const definition =
        typeof record.definition === 'string' ? record.definition.trim() : '';

      if (!word || !definition) return null;

      const examples = Array.isArray(record.examples)
        ? record.examples
            .filter((example): example is string => typeof example === 'string')
            .map((example) => example.trim())
            .filter(Boolean)
        : typeof record.examples === 'string'
          ? record.examples
              .split('\n')
              .map((example) => example.trim())
              .filter(Boolean)
          : [];

      return {
        id:
          typeof record.id === 'string' && record.id.trim().length > 0
            ? record.id
            : crypto.randomUUID(),
        word,
        pronunciation:
          typeof record.pronunciation === 'string'
            ? record.pronunciation.trim()
            : '',
        definition,
        examples,
      } satisfies VocabularyItem;
    })
    .filter((entry): entry is VocabularyItem => entry !== null);
}

export default function LessonVocabularySection({ wsId, lessonId }: Props) {
  const [entries, setEntries] = useState<VocabularyItem[]>([]);
  const [draft, setDraft] = useState<VocabularyItem>(emptyVocabulary());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exampleLines = draft.examples.length > 0 ? draft.examples : [''];

  useEffect(() => {
    let cancelled = false;

    async function loadVocabulary() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/workspaces/${wsId}/course-modules/${lessonId}/vocabulary`,
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
        setError('Could not load vocabulary yet.');
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
  }, [lessonId, wsId]);

  async function persistVocabulary(nextEntries: VocabularyItem[]) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/course-modules/${lessonId}/vocabulary`,
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
    } catch (saveError) {
      console.error('Failed to save lesson vocabulary', saveError);
      setError('Could not save vocabulary. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function resetForm() {
    setDraft(emptyVocabulary());
    setEditingId(null);
    setError(null);
  }

  function updateDraft(field: keyof VocabularyItem, value: string | string[]) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
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
      setError('Word and definition are required.');
      return;
    }

    const nextEntry: VocabularyItem = {
      id: editingId ?? crypto.randomUUID(),
      word,
      pronunciation,
      definition,
      examples,
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
  }

  return (
    <section className="mt-8 space-y-4 border-2 border-border bg-background p-6 shadow-[5px_5px_0_var(--border)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-black text-lg">
            Vocabulary Bank ({entries.length})
          </h2>
          <p className="text-muted-foreground text-sm">
            Add lesson vocabulary with pronunciation, meaning, and examples.
          </p>
        </div>
      </div>

      <Separator className="border-border border-b-2" />

      <div className="space-y-4 border-2 border-border bg-card p-5 shadow-[4px_4px_0_var(--border)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lesson-vocabulary-word">Word</Label>
            <Input
              id="lesson-vocabulary-word"
              value={draft.word}
              onChange={(event) => updateDraft('word', event.target.value)}
              placeholder="Vocabulary word"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lesson-vocabulary-pronunciation">
              Pronunciation
            </Label>
            <Input
              id="lesson-vocabulary-pronunciation"
              value={draft.pronunciation}
              onChange={(event) =>
                updateDraft('pronunciation', event.target.value)
              }
              placeholder="e.g. /ˈvɒk.ə.bjə.ler.i/"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="lesson-vocabulary-definition">Definition</Label>
          <Textarea
            id="lesson-vocabulary-definition"
            value={draft.definition}
            onChange={(event) => updateDraft('definition', event.target.value)}
            placeholder="Meaning or teacher explanation"
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="lesson-vocabulary-example-0">Examples</Label>
            <button
              className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              disabled={isSaving || draft.examples.length >= 20}
              onClick={addExampleLine}
              type="button"
            >
              + Add example
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
                  placeholder={`Example ${index + 1}`}
                />

                {(draft.examples.length > 1 || example) ? (
                  <button
                    className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                    disabled={isSaving}
                    onClick={() => removeExampleLine(index)}
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
            onClick={handleSubmit}
            disabled={isSaving}
            type="button"
          >
            {isSaving
              ? 'Saving...'
              : editingId
                ? 'Save changes'
                : 'Add vocabulary'}
          </button>

          {(editingId || draft.word || draft.definition || draft.pronunciation || draft.examples.length > 0) && (
            <button
              className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
              onClick={resetForm}
              disabled={isSaving}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading vocabulary...</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No vocabulary added for this lesson yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="space-y-4 border-2 border-border bg-card p-5 shadow-[4px_4px_0_var(--border)]"
            >
              <div className="space-y-1">
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
                    Examples
                  </p>
                  <ul className="space-y-1 text-sm">
                    {entry.examples.map((example) => (
                      <li key={`${entry.id}-${example}`}>• {example}</li>
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
                  Edit
                </button>
                <button
                  className="border-2 border-red-700 bg-red-600 px-3 py-1.5 font-bold text-sm text-white shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                  onClick={() => handleDelete(entry.id)}
                  disabled={isSaving}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

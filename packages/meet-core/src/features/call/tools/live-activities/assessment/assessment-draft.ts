import type {
  LiveActivitiesSnapshot,
  LiveActivityCommand,
} from '../activities-store';

export type AssessmentKind = 'short' | 'long' | 'choice';
export const ASSESSMENT_KINDS: readonly AssessmentKind[] = [
  'short',
  'long',
  'choice',
];
export const MAX_ASSESSMENT_ITEMS = 20;

export type DraftItem = {
  /** Stable while editing; the room issues its own ids on save. */
  key: string;
  prompt: string;
  kind: AssessmentKind;
  options: string[];
  answer: number | undefined;
};

type SavedItems = Extract<
  LiveActivityCommand,
  { kind: 'assessment.set' }
>['items'];

export const newDraftItem = (): DraftItem => ({
  key: crypto.randomUUID(),
  prompt: '',
  kind: 'short',
  options: ['', ''],
  answer: undefined,
});

/** The saved items as editable drafts, with the answer keys only managers hold. */
export function draftItems(
  items: LiveActivitiesSnapshot['assessment']['items'],
  answers: Readonly<Record<string, number>>
): DraftItem[] {
  return items.map((item) => ({
    key: item.id,
    prompt: item.prompt,
    kind: item.kind,
    options: item.options ?? ['', ''],
    answer: answers[item.id] ?? item.correct,
  }));
}

/** What `assessment.set` accepts, or null while any item is incomplete. */
export function assessmentItems(
  drafts: readonly DraftItem[]
): SavedItems | null {
  const items: SavedItems = [];
  for (const draft of drafts) {
    const prompt = draft.prompt.trim();
    if (!prompt) return null;
    if (draft.kind !== 'choice') {
      items.push({ prompt, kind: draft.kind });
      continue;
    }
    const options = draft.options.map((option) => option.trim());
    if (options.length < 2 || options.some((option) => !option)) return null;
    items.push({
      prompt,
      kind: 'choice',
      options,
      ...(draft.answer === undefined ? {} : { answer: draft.answer }),
    });
  }
  return items;
}

export function sameAssessment(
  drafts: readonly DraftItem[],
  saved: readonly DraftItem[]
) {
  return (
    JSON.stringify(assessmentItems(drafts)) ===
    JSON.stringify(assessmentItems(saved))
  );
}

'use client';

import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, Sparkles } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  draftMeetLiveActivity,
  type MeetLiveActivityDraftDifficulty,
  type MeetLiveActivityDraftKind,
  type MeetLiveActivityDraftResult,
} from '@tuturuuu/internal-api/meet-live-activities';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ToolAction } from '../tool-ui';
import { MiraActivityDraftPreview } from './mira-activity-draft-preview';

const ITEM_COUNTS = ['3', '5', '8', '10', '12'] as const;
const DIFFICULTIES: readonly MeetLiveActivityDraftDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
];

type MiraDraftTranslator = ReturnType<
  typeof useTranslations<'meet.call.live_activities.mira_draft'>
>;

function titleForKind(
  t: MiraDraftTranslator,
  kind: MeetLiveActivityDraftKind
): string {
  switch (kind) {
    case 'flashcards':
      return t('title_flashcards');
    case 'game':
      return t('title_game');
    case 'icebreaker':
      return t('title_icebreaker');
    case 'assessment':
      return t('title_assessment');
    default:
      return t('trigger');
  }
}

function topicPlaceholderForKind(
  t: MiraDraftTranslator,
  kind: MeetLiveActivityDraftKind
): string {
  switch (kind) {
    case 'flashcards':
      return t('topic_placeholder_flashcards');
    case 'game':
      return t('topic_placeholder_game');
    case 'icebreaker':
      return t('topic_placeholder_icebreaker');
    case 'assessment':
      return t('topic_placeholder_assessment');
    default:
      return t('topic_placeholder_flashcards');
  }
}

function difficultyLabel(
  t: MiraDraftTranslator,
  level: MeetLiveActivityDraftDifficulty
): string {
  switch (level) {
    case 'beginner':
      return t('difficulty_beginner');
    case 'intermediate':
      return t('difficulty_intermediate');
    case 'advanced':
      return t('difficulty_advanced');
    default:
      return t('difficulty_intermediate');
  }
}

function draftErrorMessage(t: MiraDraftTranslator, error: unknown): string {
  if (error instanceof InternalApiError) {
    switch (error.code) {
      case 'MIRA_CREDITS_UNAVAILABLE':
        return t('errors.credits');
      case 'MIRA_CONSENT_REQUIRED':
      case 'MIRA_PRIVATE_CONSENT_UNAVAILABLE':
        return t('errors.consent');
      case 'MIRA_WORKSPACE_UNAVAILABLE':
        return t('errors.workspace');
      case 'MIRA_INVALID_DRAFT':
        return t('errors.invalid_draft');
      case 'MIRA_AUTH_REQUIRED':
      case 'MIRA_DRAFT_UNAVAILABLE':
        return t('errors.unavailable');
    }
    if (error.status === 401 || error.status === 403) {
      return t('errors.unavailable');
    }
  }
  return t('errors.generic');
}

function MiraActivityDraftForm<K extends MeetLiveActivityDraftKind>({
  meetingId,
  kind,
  onApply,
  onClose,
}: {
  meetingId: string;
  kind: K;
  onApply: (draft: Extract<MeetLiveActivityDraftResult, { kind: K }>) => void;
  onClose: () => void;
}) {
  const t = useTranslations('meet.call.live_activities.mira_draft');
  const currentLocale = useLocale();
  const fieldId = useId();
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState<string>('5');
  const [language, setLanguage] = useState<'en' | 'vi'>(
    currentLocale === 'vi' ? 'vi' : 'en'
  );
  const [difficulty, setDifficulty] = useState<
    MeetLiveActivityDraftDifficulty | ''
  >('');
  const [draft, setDraft] = useState<Extract<
    MeetLiveActivityDraftResult,
    { kind: K }
  > | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      draftMeetLiveActivity(meetingId, {
        kind,
        prompt: prompt.trim(),
        count: kind === 'icebreaker' ? 1 : Number(count),
        locale: language,
        ...(difficulty ? { difficulty } : {}),
      }),
    retry: false,
    onSuccess: (result) => {
      if (result.kind === kind) {
        setDraft(result as Extract<MeetLiveActivityDraftResult, { kind: K }>);
      }
    },
  });

  const canGenerate = prompt.trim().length >= 3 && !mutation.isPending;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canGenerate) mutation.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-topic`}>{t('topic_label')}</Label>
        <Textarea
          id={`${fieldId}-topic`}
          value={prompt}
          maxLength={1000}
          rows={3}
          placeholder={topicPlaceholderForKind(t, kind)}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kind !== 'icebreaker' && (
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-count`}>{t('count_label')}</Label>
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger
                id={`${fieldId}-count`}
                aria-label={t('count_label')}
              >
                <SelectValue placeholder={t('count_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {ITEM_COUNTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-language`}>{t('language_label')}</Label>
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as 'en' | 'vi')}
          >
            <SelectTrigger
              id={`${fieldId}-language`}
              aria-label={t('language_label')}
            >
              <SelectValue placeholder={t('language_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('language_en')}</SelectItem>
              <SelectItem value="vi">{t('language_vi')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-difficulty`}>
            {t('difficulty_label')}
          </Label>
          <Select
            value={difficulty}
            onValueChange={(value) =>
              setDifficulty(value as MeetLiveActivityDraftDifficulty)
            }
          >
            <SelectTrigger
              id={`${fieldId}-difficulty`}
              aria-label={t('difficulty_label')}
            >
              <SelectValue placeholder={t('difficulty_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map((level) => (
                <SelectItem key={level} value={level}>
                  {difficultyLabel(t, level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {mutation.isError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{draftErrorMessage(t, mutation.error)}</span>
        </div>
      )}

      {draft && <MiraActivityDraftPreview draft={draft} />}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          variant={draft ? 'outline' : 'default'}
          disabled={!canGenerate}
        >
          {mutation.isPending ? (
            <Loader2 className="mr-1.5 size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Sparkles className="mr-1.5 size-4" />
          )}
          {mutation.isPending
            ? t('generating')
            : draft
              ? t('regenerate')
              : t('generate')}
        </Button>
        {draft && (
          <Button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t('apply')}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

export function MiraActivityDraftDialog<K extends MeetLiveActivityDraftKind>({
  meetingId,
  kind,
  enabled,
  onApply,
}: {
  meetingId: string;
  kind: K;
  enabled: boolean;
  onApply: (draft: Extract<MeetLiveActivityDraftResult, { kind: K }>) => void;
}) {
  const t = useTranslations('meet.call.live_activities.mira_draft');
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <>
      <ToolAction
        icon={Sparkles}
        label={t('trigger')}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{titleForKind(t, kind)}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          {open && (
            <MiraActivityDraftForm
              meetingId={meetingId}
              kind={kind}
              onApply={onApply}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

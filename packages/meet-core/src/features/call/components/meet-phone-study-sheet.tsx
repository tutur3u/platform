'use client';

import {
  ArrowUp,
  BookOpen,
  Check,
  Hand,
  Lock,
  LockKeyhole,
  Mic,
  Send,
  Share2,
  Sparkles,
  Video,
  VideoOff,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { PhoneStudySheetTab } from '../hooks/use-phone-call-ui';
import {
  PhoneBottomSheetFrame,
  type PhonePreviewTile,
} from './meet-phone-bottom-sheet';
import { MiraMark } from './mira-mark';

export interface PhoneQaQuestion {
  id: string;
  body: string;
  authorName?: string;
  anonymous?: boolean;
  upvotes: number;
  upvoted?: boolean;
  answered?: boolean;
}

export interface PhoneHandQueueEntry {
  userId: string;
  displayName: string;
  micAllowed: boolean;
  cameraAllowed: boolean;
}

export interface PhoneTutorMessage {
  id: string;
  sender: 'user' | 'mira';
  body: string;
}

export interface MeetPhoneStudySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab?: PhoneStudySheetTab;
  onTabChange?: (tab: PhoneStudySheetTab) => void;
  previewTiles?: [PhonePreviewTile, PhonePreviewTile] | PhonePreviewTile[];
  handRaised: boolean;
  handQueuePosition?: number;
  onRaiseHand: () => void;
  onLowerHand: () => void;
  handQueue?: PhoneHandQueueEntry[];
  questions?: PhoneQaQuestion[];
  onSubmitQuestion?: (body: string, anonymous: boolean) => void;
  onUpvoteQuestion?: (questionId: string) => void;
  lessonChip?: string;
  tutorMessages?: PhoneTutorMessage[];
  tutorTyping?: boolean;
  onSendTutorMessage?: (body: string) => void;
  onShareSnippet?: () => void;
  onExplainSimpler?: () => void;
  onToggleTutorVoice?: () => void;
  tutorVoiceActive?: boolean;
  className?: string;
}

/**
 * Screen D (Mockup 07, 390x844): Bottom Sheet for Student Study Tools (Q&A | Hand | Tutor).
 */
export function MeetPhoneStudySheet({
  open,
  onOpenChange,
  activeTab: controlledTab,
  onTabChange,
  previewTiles,
  handRaised,
  handQueuePosition = 1,
  onRaiseHand,
  onLowerHand,
  handQueue = [],
  questions = [],
  onSubmitQuestion,
  onUpvoteQuestion,
  lessonChip,
  tutorMessages = [],
  tutorTyping = false,
  onSendTutorMessage,
  onShareSnippet,
  onExplainSimpler,
  onToggleTutorVoice,
  tutorVoiceActive = false,
  className,
}: MeetPhoneStudySheetProps) {
  const t = useTranslations('meet.call.phone');
  const [internalTab, setInternalTab] = useState<PhoneStudySheetTab>('qa');
  const activeTab = controlledTab ?? internalTab;

  const setTab = (next: PhoneStudySheetTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  const [qaDraft, setQaDraft] = useState('');
  const [askAnonymously, setAskAnonymously] = useState(false);
  const [tutorDraft, setTutorDraft] = useState('');
  const anonSwitchId = useId();

  const submitQuestion = () => {
    const trimmed = qaDraft.trim();
    if (!trimmed) return;
    onSubmitQuestion?.(trimmed, askAnonymously);
    setQaDraft('');
  };

  const submitTutor = () => {
    const trimmed = tutorDraft.trim();
    if (!trimmed) return;
    onSendTutorMessage?.(trimmed);
    setTutorDraft('');
  };

  const topBanner = handRaised ? (
    <div
      data-testid="study-hand-raised-banner"
      role="status"
      className="flex items-center justify-between gap-2 rounded-full border border-dynamic-orange/35 bg-dynamic-orange/15 px-3.5 py-1.5 text-xs"
    >
      <div className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
        <Hand
          className="size-3.5 shrink-0 text-dynamic-orange"
          aria-hidden="true"
        />
        <span className="truncate font-mono">
          {t('hand_banner', { position: handQueuePosition })}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onLowerHand}
        className="h-7 shrink-0 rounded-full px-3 font-semibold text-xs"
      >
        {t('hand_lower')}
      </Button>
    </div>
  ) : null;

  return (
    <PhoneBottomSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      title={t('study_sheet_title')}
      previewTiles={previewTiles}
      topBanner={topBanner}
      className={className}
    >
      {/* Segmented switcher: Q&A | Hand | Tutor */}
      <div
        role="tablist"
        aria-label={t('study_sheet_title')}
        className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-muted p-1"
      >
        {(
          [
            { id: 'qa', label: t('qa_tab') },
            { id: 'hand', label: t('hand_tab') },
            { id: 'tutor', label: t('tutor_tab') },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              'min-h-10 rounded-full px-3 font-semibold text-xs transition-colors motion-reduce:transition-none',
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Q&A Tab */}
      {activeTab === 'qa' && (
        <div role="tabpanel" aria-label={t('qa_tab')} className="space-y-4">
          <form
            className="space-y-2.5 rounded-[18px] border border-border/70 bg-card p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion();
            }}
          >
            <div className="flex items-center gap-2">
              <Input
                value={qaDraft}
                onChange={(event) => setQaDraft(event.target.value)}
                placeholder={t('ask_class_placeholder')}
                aria-label={t('ask_class_placeholder')}
                className="min-h-11 flex-1 text-base"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!qaDraft.trim()}
                className="min-h-11 shrink-0 rounded-full px-4 font-semibold"
              >
                {t('qa_send')}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 px-1">
              <Label
                htmlFor={anonSwitchId}
                className="text-muted-foreground text-xs"
              >
                {t('ask_anonymously')}
              </Label>
              <Switch
                id={anonSwitchId}
                checked={askAnonymously}
                onCheckedChange={setAskAnonymously}
              />
            </div>
          </form>

          {questions.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-xs">
              {t('qa_empty')}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {questions.map((question) => (
                <li
                  key={question.id}
                  data-testid={`qa-card-${question.id}`}
                  className="flex items-start justify-between gap-3 rounded-[18px] border border-border/70 bg-card p-3.5"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-muted-foreground text-xs">
                        {question.anonymous
                          ? t('qa_anonymous_author')
                          : (question.authorName ?? t('qa_anonymous_author'))}
                      </span>
                      {question.answered && (
                        <Badge
                          variant="success"
                          className="gap-1 rounded-full px-2 py-0.5 text-[11px]"
                        >
                          <Check className="size-3" aria-hidden="true" />
                          {t('qa_answered')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-foreground text-sm leading-snug">
                      {question.body}
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={question.upvoted ? 'default' : 'outline'}
                    aria-pressed={Boolean(question.upvoted)}
                    aria-label={t('qa_upvote', { count: question.upvotes })}
                    onClick={() => onUpvoteQuestion?.(question.id)}
                    className="h-11 min-w-11 shrink-0 flex-col gap-0.5 rounded-2xl px-2.5"
                  >
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                    <span className="font-mono text-[11px] tabular-nums">
                      {question.upvotes}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Hand Tab */}
      {activeTab === 'hand' && (
        <div role="tabpanel" aria-label={t('hand_tab')} className="space-y-5">
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            {/* 150px halo circular raise/lower hand button */}
            <div
              data-testid="study-hand-halo"
              className={cn(
                'grid size-[150px] place-items-center rounded-full border transition-colors motion-reduce:transition-none',
                handRaised
                  ? 'border-dynamic-orange/40 bg-dynamic-orange/15 motion-safe:animate-pulse motion-reduce:animate-none'
                  : 'border-border/70 bg-muted/60'
              )}
            >
              <Button
                type="button"
                onClick={handRaised ? onLowerHand : onRaiseHand}
                aria-pressed={handRaised}
                aria-label={
                  handRaised ? t('hand_lower_action') : t('hand_raise_action')
                }
                className={cn(
                  'size-[112px] flex-col gap-2 rounded-full font-semibold text-xs shadow-md',
                  handRaised
                    ? 'bg-dynamic-orange text-white hover:bg-dynamic-orange/90'
                    : 'bg-primary text-primary-foreground'
                )}
              >
                <Hand className="size-7" aria-hidden="true" />
                <span>
                  {handRaised ? t('hand_lower_action') : t('hand_raise_action')}
                </span>
              </Button>
            </div>

            <p
              data-testid="study-hand-position"
              className="font-semibold text-sm text-foreground"
            >
              {handRaised
                ? t('hand_queue_position', { position: handQueuePosition })
                : t('hand_queue_prompt')}
            </p>
          </div>

          {/* Queue preview showing mic/camera lock/allow status per host override */}
          <section aria-label={t('hand_queue_title')} className="space-y-2">
            <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              {t('hand_queue_title')}
            </h3>
            {handQueue.length === 0 ? (
              <p className="rounded-[18px] border border-dashed border-border/70 p-4 text-center text-muted-foreground text-xs">
                {t('hand_queue_empty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {handQueue.map((entry, index) => (
                  <li
                    key={entry.userId}
                    data-testid={`hand-queue-item-${entry.userId}`}
                    className="flex items-center justify-between gap-2 rounded-[18px] border border-border/70 bg-card px-3.5 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary font-mono font-semibold text-xs text-secondary-foreground tabular-nums">
                        #{index + 1}
                      </span>
                      <span className="truncate font-medium text-xs text-foreground">
                        {entry.displayName}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge
                        variant={entry.micAllowed ? 'success' : 'secondary'}
                        className="gap-1 rounded-full px-2 py-0.5 text-[11px]"
                      >
                        {entry.micAllowed ? (
                          <Mic className="size-3" aria-hidden="true" />
                        ) : (
                          <Lock className="size-3" aria-hidden="true" />
                        )}
                        {entry.micAllowed
                          ? t('hand_queue_allowed')
                          : t('hand_queue_locked')}
                      </Badge>
                      <span
                        aria-label={
                          entry.cameraAllowed
                            ? t('camera_on_label')
                            : t('camera_locked_title')
                        }
                        className={cn(
                          'grid size-6 place-items-center rounded-full border',
                          entry.cameraAllowed
                            ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                            : 'border-border/70 bg-muted text-muted-foreground'
                        )}
                      >
                        {entry.cameraAllowed ? (
                          <Video className="size-3" aria-hidden="true" />
                        ) : (
                          <VideoOff className="size-3" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Tutor Tab */}
      {activeTab === 'tutor' && (
        <div
          role="tabpanel"
          aria-label={t('tutor_tab')}
          className="space-y-3.5"
        >
          {/* Private · only you lock badge + lesson/slide chip */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              variant="secondary"
              className="gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs"
            >
              <LockKeyhole className="size-3" aria-hidden="true" />
              {t('tutor_private_badge')}
            </Badge>

            {lessonChip && (
              <Badge
                variant="outline"
                className="gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px]"
              >
                <BookOpen className="size-3" aria-hidden="true" />
                {lessonChip}
              </Badge>
            )}
          </div>

          {/* Message bubbles: user primary, Mira --mira-bg */}
          <ol className="space-y-2.5" aria-live="polite">
            {tutorMessages.map((msg) => {
              const isMira = msg.sender === 'mira';
              return (
                <li
                  key={msg.id}
                  data-testid={`tutor-msg-${msg.sender}`}
                  style={
                    isMira ? { backgroundColor: 'var(--mira-bg)' } : undefined
                  }
                  className={cn(
                    'flex max-w-[88%] flex-col gap-1 rounded-[18px] px-3.5 py-2.5 text-sm',
                    isMira
                      ? 'mr-auto border border-dynamic-purple/25 text-foreground'
                      : 'ml-auto bg-primary text-primary-foreground'
                  )}
                >
                  {isMira && (
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-dynamic-purple">
                      <MiraMark size={16} />
                      <span>Mira</span>
                    </div>
                  )}
                  <p className="leading-relaxed">{msg.body}</p>
                </li>
              );
            })}
          </ol>

          {tutorTyping && (
            <p
              role="status"
              data-testid="tutor-mira-typing"
              className="flex items-center gap-2 text-xs text-dynamic-purple"
            >
              <MiraMark size={16} />
              <span className="motion-reduce:animate-none">
                {t('mira_typing_tutor')}
              </span>
            </p>
          )}

          {/* Share snippet + Explain simpler quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onShareSnippet}
              className="min-h-10 rounded-full px-3.5 text-xs"
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              {t('share_snippet')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onExplainSimpler}
              className="min-h-10 rounded-full px-3.5 text-xs"
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t('explain_simpler')}
            </Button>
          </div>

          {/* Private composer + voice mic button */}
          <form
            className="flex items-center gap-2 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              submitTutor();
            }}
          >
            <Button
              type="button"
              size="icon"
              variant={tutorVoiceActive ? 'default' : 'secondary'}
              aria-label={t('tutor_voice_mic')}
              aria-pressed={tutorVoiceActive}
              onClick={onToggleTutorVoice}
              className={cn(
                'size-11 shrink-0 rounded-full',
                tutorVoiceActive &&
                  'bg-dynamic-purple text-white hover:bg-dynamic-purple/90'
              )}
            >
              <Mic className="size-4" aria-hidden="true" />
            </Button>
            <Input
              value={tutorDraft}
              onChange={(event) => setTutorDraft(event.target.value)}
              placeholder={t('tutor_composer_placeholder')}
              aria-label={t('tutor_composer_placeholder')}
              className="min-h-11 flex-1 text-base"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!tutorDraft.trim()}
              aria-label={t('tutor_send')}
              className="size-11 shrink-0 rounded-full"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}
    </PhoneBottomSheetFrame>
  );
}

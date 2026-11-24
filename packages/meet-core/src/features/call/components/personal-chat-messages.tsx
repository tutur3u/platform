'use client';
import { BookOpen, LockKeyhole, Mic, Share2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import type { LiveSessionSnapshot } from '../../live-assistant/live-session-store';
import { LiveReviewCard } from '../../live-assistant/live-review-card';
import { ChatMessageBody } from './chat-message-body';
import { MiraAvatar, MiraProfile } from './mira-profile';

export type MiraTutorReference = {
  title: string;
  onOpenSlide: () => void;
};

export type Turn = { id: string; body: string } & (
  | { assistant: true; question: string }
  | { assistant: false }
);

function MiraMark() {
  return (
    <div className="mt-0.5 shrink-0">
      <MiraProfile>
        <MiraAvatar size={24} />
      </MiraProfile>
    </div>
  );
}

function Bubble({ body }: { body: string }) {
  return (
    <li className="flex justify-end">
      <div className="wrap-break-word max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm">
        <ChatMessageBody body={body} assistant={false} />
      </div>
    </li>
  );
}

function Reply({ body, children }: { body: string; children?: ReactNode }) {
  return (
    <li className="flex min-w-0 gap-2.5 text-sm">
      <MiraMark />
      <div className="wrap-break-word min-w-0 flex-1 space-y-1.5">
        <ChatMessageBody body={body} assistant />
        {children}
      </div>
    </li>
  );
}

function SlideReference({
  reference,
  action,
}: {
  reference: MiraTutorReference;
  action: ReactNode;
}) {
  const tm = useTranslations('meet.call.miraEverywhere.tutor');
  return (
    <section
      aria-label={reference.title}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <h4 className="flex items-center gap-2 border-b p-2.5 font-medium text-xs">
        <BookOpen
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        {reference.title}
      </h4>
      <div className="flex flex-wrap gap-1.5 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 motion-reduce:transition-none"
          onClick={reference.onOpenSlide}
        >
          {tm('openSlide')}
        </Button>
        {action}
      </div>
    </section>
  );
}

function EmptyState({ onTalk }: { onTalk?: () => void }) {
  const ta = useTranslations('meet.call.miraEverywhere.tutor.assistant');
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LockKeyhole aria-hidden className="size-5" />
      </span>
      <p className="font-medium text-base">{ta('empty')}</p>
      {onTalk && (
        <>
          <Button
            type="button"
            className="h-10 gap-2 rounded-full px-5"
            onClick={onTalk}
          >
            <Mic aria-hidden className="size-4" />
            {ta('talk')}
          </Button>
          <p className="text-muted-foreground text-xs">{ta('orType')}</p>
        </>
      )}
    </div>
  );
}

export function PersonalChatMessages({
  history,
  session,
  pending,
  referenceForAnswer,
  onShare,
  onTalk,
}: {
  history: readonly Turn[];
  session: LiveSessionSnapshot | null;
  pending: boolean;
  referenceForAnswer?: (answer: {
    question: string;
    body: string;
  }) => MiraTutorReference | undefined;
  onShare: (body: string) => void;
  onTalk?: () => void;
}) {
  const t = useTranslations('meet.call');
  const tm = useTranslations('meet.call.miraEverywhere.tutor');
  const end = useRef<HTMLDivElement>(null);
  const spoken = session?.mode === 'personal' ? session.transcript : [];
  const reviews = session?.reviews ?? [];
  const ready = ['listening', 'paused'].includes(session?.status ?? '');
  const count = history.length + spoken.length + reviews.length;
  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [count, pending]);
  const shareButton = (body: string) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ms-2 h-7 gap-1.5 whitespace-normal px-2 text-muted-foreground text-xs motion-reduce:transition-none"
      onClick={() => onShare(body.slice(0, 2000))}
    >
      <Share2 aria-hidden className="size-3.5" />
      {tm('shareSnippet')}
    </Button>
  );
  return (
    <ScrollArea className="min-h-0 flex-1 px-4">
      {count === 0 && !pending && <EmptyState onTalk={onTalk} />}
      <ol className="space-y-4 py-3" aria-live="polite">
        {history.map((turn) => {
          if (!turn.assistant) return <Bubble key={turn.id} body={turn.body} />;
          const reference = referenceForAnswer?.({
            question: turn.question,
            body: turn.body,
          });
          return (
            <Reply key={turn.id} body={turn.body}>
              {reference ? (
                <SlideReference
                  reference={reference}
                  action={shareButton(turn.body)}
                />
              ) : (
                shareButton(turn.body)
              )}
            </Reply>
          );
        })}
        {spoken.map((turn, index) =>
          turn.role === 'assistant' ? (
            <Reply key={`live-${index}-${turn.role}`} body={turn.text} />
          ) : (
            <Bubble key={`live-${index}-${turn.role}`} body={turn.text} />
          )
        )}
        {pending && (
          <li
            role="status"
            className="flex items-center gap-2.5 text-muted-foreground text-sm"
          >
            <MiraMark />
            {t('mira_thinking')}
          </li>
        )}
      </ol>
      {session &&
        reviews.map((review) => (
          <LiveReviewCard
            key={review.id}
            review={review}
            ready={ready}
            decide={session.controls.decide}
          />
        ))}
      <div ref={end} />
    </ScrollArea>
  );
}

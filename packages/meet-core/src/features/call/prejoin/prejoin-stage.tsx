'use client';

import { ArrowLeft, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { FormEvent, ReactNode } from 'react';
import { AdmissionNotice } from '../components/admission-notice';
import { PrejoinPreview } from './prejoin-preview';
import type { PrejoinCapture } from './use-prejoin-capture';

/** One state at a time: the stage and its Join button never disagree. */
export type PrejoinPhase =
  | { kind: 'ready'; label: string; disabled?: boolean }
  | { kind: 'saving'; label: string }
  | { kind: 'connecting'; label: string }
  | { kind: 'waiting'; label: string }
  | { kind: 'error'; label: string; message: string };

function JoinButton({ phase }: { phase: PrejoinPhase }) {
  const t = useTranslations('meet.call');
  const pending = phase.kind !== 'ready' && phase.kind !== 'error';
  const disabled = pending || (phase.kind === 'ready' && !!phase.disabled);
  return (
    <Button
      aria-busy={pending}
      className="w-full"
      disabled={disabled}
      size="lg"
      type="submit"
    >
      {pending && (
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
      )}
      {phase.label}
      {phase.kind === 'connecting' && (
        <span className="sr-only"> {t('connecting')}</span>
      )}
    </Button>
  );
}

/**
 * The single pre-join layout: preview on the left, meeting details and the
 * Join action on the right. Connecting, waiting and error are the same
 * layout with a different Join button; on a phone Join sticks to the bottom
 * without ever sitting above the fields, which scroll clear of it.
 */
export function PrejoinStage({
  title,
  titleEditor,
  capture,
  phase,
  avatarUrl,
  name,
  back,
  summary,
  notice,
  fields,
  consent,
  secondary,
  onSubmit,
  viewer,
  presenceOnly,
  onPresenceChange,
}: {
  title: string;
  /** Replaces the heading when the viewer may rename the meeting. */
  titleEditor?: ReactNode;
  capture: PrejoinCapture;
  phase: PrejoinPhase;
  avatarUrl?: string;
  /** Initial for the camera-off avatar. */
  name: string;
  /** Leaves before joining; a quiet action at the top left, never beside Join. */
  back?: { label: string; onClick: () => void };
  /** Who is already inside. */
  summary?: ReactNode;
  /** Reserved above the fields for the room's consent and transcription notices. */
  notice?: ReactNode;
  /** The name field, or the guest name and human check. */
  fields?: ReactNode;
  /** The Mira consent box, rendered as given. */
  consent?: ReactNode;
  /** Fallback actions such as asking the host; they scroll with the form. */
  secondary?: ReactNode;
  onSubmit: () => void;
  viewer?: boolean;
  presenceOnly?: boolean;
  onPresenceChange?: (enabled: boolean) => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (phase.kind === 'ready' && !phase.disabled) onSubmit();
    else if (phase.kind === 'error') onSubmit();
  };
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      {back && (
        <div className="px-2 pt-3 lg:px-6">
          <Button
            className="gap-1.5 text-muted-foreground"
            onClick={back.onClick}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {back.label}
          </Button>
        </div>
      )}
      <div className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,1fr)] lg:items-center lg:gap-10 lg:px-8 lg:py-10">
        <PrejoinPreview
          avatarUrl={avatarUrl}
          capture={capture}
          name={name}
          onPresenceChange={onPresenceChange}
          presenceOnly={presenceOnly}
          viewer={viewer}
        />
        <form
          aria-labelledby="prejoin-title"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={submit}
        >
          {titleEditor ?? (
            <h1
              className="text-balance font-semibold text-xl tracking-tight"
              id="prejoin-title"
            >
              {title}
            </h1>
          )}
          {summary}
          {notice}
          {phase.kind === 'waiting' && (
            <AdmissionNotice connecting={false} waiting />
          )}
          {phase.kind === 'error' && (
            <AdmissionNotice
              connecting={false}
              error={phase.message}
              waiting={false}
            />
          )}
          {fields && <div className="scroll-mb-28 space-y-4">{fields}</div>}
          {consent && <div className="scroll-mb-28">{consent}</div>}
          {secondary && <div className="space-y-2">{secondary}</div>}
          <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-backdrop-filter:bg-background/80 lg:static lg:mx-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <JoinButton phase={phase} />
          </div>
        </form>
      </div>
    </main>
  );
}

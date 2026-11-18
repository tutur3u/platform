'use client';
import { useMutation } from '@tanstack/react-query';
import {
  BookOpen,
  LockKeyhole,
  RefreshCw,
  Send,
  Share2,
} from '@tuturuuu/icons';
import {
  askPersonalMeetAssistant,
  readPrivateMiraPolicy,
  setPrivateMiraChoice,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { MiraWorkspaceSettingsLink } from '../../live-assistant/mira-workspace-settings-link';
import { confirmPrivateChoice } from '../../live-assistant/private-choice';
import { ChatMessageBody } from './chat-message-body';
import {
  MiraPermissionsCard,
  type MiraPermissionsProps,
} from './mira-permissions-card';
import { MiraAvatar, MiraProfile } from './mira-profile';

export type MiraTutorReference = {
  title: string;
  onOpenSlide: () => void;
};

const privateFailureKeys = {
  MIRA_ACCOUNT_UNAVAILABLE: 'personal_account_unavailable',
  MIRA_CONSENT_REQUIRED: 'personal_consent_required',
  MIRA_CREDITS_UNAVAILABLE: 'personal_credits_unavailable',
  MIRA_DEPLOYMENT_DISABLED: 'personal_deployment_unavailable',
  MIRA_PROVIDER_UNAVAILABLE: 'personal_provider_unavailable',
  MIRA_WORKSPACE_UNAVAILABLE: 'personal_workspace_unavailable',
} as const;

function personalFailureKey(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  return typeof code === 'string' && Object.hasOwn(privateFailureKeys, code)
    ? privateFailureKeys[code as keyof typeof privateFailureKeys]
    : 'assistant_failed';
}

type Turn = { id: string; body: string } & (
  | { assistant: true; question: string }
  | { assistant: false }
);
export function PersonalChat({
  meetingId,
  accountId,
  wsId,
  onShare,
  referenceForAnswer,
  permissions,
}: {
  meetingId: string;
  accountId?: string;
  wsId?: string;
  onShare: (body: string) => Promise<unknown>;
  referenceForAnswer?: (answer: {
    question: string;
    body: string;
  }) => MiraTutorReference | undefined;
  permissions?: MiraPermissionsProps;
}) {
  const t = useTranslations('meet.call');
  const liveT = useTranslations('meet.live');
  const tm = useTranslations('meet.call.miraEverywhere.tutor');
  const [history, setHistory] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [share, setShare] = useState<string | null>(null);
  const activeScope = useRef({ accountId, meetingId });
  activeScope.current = { accountId, meetingId };
  const retry = useRef<{
    question: string;
    requestId: string;
    startedAt: number;
  } | null>(null);
  const ask = useMutation({
    onError: (error) => {
      // Only a confirmed terminal receipt can safely use a new request ID.
      if ('status' in error && error.status === 422) retry.current = null;
    },
    mutationFn: async (question: string) => {
      if (retry.current?.question !== question)
        retry.current = {
          question,
          requestId: crypto.randomUUID(),
          startedAt: Date.now(),
        };
      const result = await askPersonalMeetAssistant(meetingId, {
        ...retry.current,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        history: history.slice(-12).map(({ body, assistant }) => ({
          body: body.slice(0, 2000),
          assistant,
        })),
      });
      setHistory((current) => {
        const turns: Turn[] = [
          ...current,
          { id: crypto.randomUUID(), body: question, assistant: false },
          {
            id: crypto.randomUUID(),
            body: result.text,
            assistant: true,
            question,
          },
        ];
        return turns.slice(-40);
      });
      retry.current = null;
      setDraft('');
    },
  });
  const enable = useMutation({
    mutationFn: async () => {
      const policy = await readPrivateMiraPolicy(meetingId);
      if (!accountId || !policy.available || policy.accountId !== accountId)
        throw new Error('Private Mira is unavailable');
      await setPrivateMiraChoice(
        meetingId,
        policy.version,
        'continue',
        accountId
      );
      const confirmed = await readPrivateMiraPolicy(meetingId);
      if (
        confirmed.choice?.meetingId !== meetingId ||
        confirmed.choice.accountId !== accountId
      )
        throw new Error('Private Mira account changed');
      confirmPrivateChoice(confirmed, 'continue');
      return { accountId, meetingId };
    },
    onSuccess: (scope) => {
      setConfirmEnable(false);
      if (
        scope.accountId === activeScope.current.accountId &&
        scope.meetingId === activeScope.current.meetingId &&
        draft.trim()
      )
        ask.mutate(draft.trim());
    },
  });
  const retryingDraft = ask.isError && ask.variables === draft.trim();
  const publish = useMutation({
    mutationFn: async (text: string) => {
      await onShare(text);
      setShare(null);
    },
  });
  return (
    <>
      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        <div className="mb-4 flex gap-2 rounded-xl border bg-muted/35 p-3 text-muted-foreground text-xs">
          <LockKeyhole
            aria-hidden
            className="size-4 shrink-0 text-dynamic-purple"
          />
          <p>
            <strong className="text-foreground">{tm('privacy')}</strong>{' '}
            {tm('privacyDetail')}
          </p>
        </div>
        <ol className="space-y-5" aria-live="polite">
          {history.map((turn) => {
            const reference = turn.assistant
              ? referenceForAnswer?.({
                  question: turn.question,
                  body: turn.body,
                })
              : undefined;
            const shareButton = turn.assistant && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto min-h-7 whitespace-normal motion-reduce:transition-none"
                onClick={() => {
                  publish.reset();
                  setShare(turn.body.slice(0, 2000));
                }}
              >
                <Share2 aria-hidden className="size-3.5" />
                {tm('shareSnippet')}
              </Button>
            );
            return (
              <li key={turn.id} className="flex min-w-0 gap-2 text-sm">
                {turn.assistant && (
                  <div className="shrink-0">
                    <MiraProfile>
                      <MiraAvatar size={28} />
                    </MiraProfile>
                  </div>
                )}
                <div className="wrap-break-word min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 font-semibold text-xs">
                    {turn.assistant ? (
                      <>
                        <span className="text-dynamic-purple">
                          {tm('title')}
                        </span>
                        <Badge variant="outline" className="gap-1">
                          <LockKeyhole aria-hidden className="size-3" />
                          {tm('privateTag')}
                        </Badge>
                      </>
                    ) : (
                      t('you')
                    )}
                  </div>
                  <ChatMessageBody
                    body={turn.body}
                    assistant={turn.assistant}
                  />
                  {reference ? (
                    <section
                      aria-label={reference.title}
                      className="overflow-hidden rounded-xl border border-dynamic-purple/25 bg-card"
                    >
                      <h4 className="flex items-center gap-2 border-b bg-dynamic-purple/5 p-2.5 font-semibold text-xs">
                        <BookOpen
                          aria-hidden
                          className="size-4 shrink-0 text-dynamic-purple"
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
                        {shareButton}
                      </div>
                    </section>
                  ) : (
                    shareButton
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {!history.length && (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {t('personal_chat_empty')}
          </p>
        )}
        <div className="mt-3">
          <MiraPermissionsCard {...permissions} />
        </div>
      </ScrollArea>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() && !ask.isPending) ask.mutate(draft.trim());
        }}
      >
        {ask.isError && (
          <div role="alert" className="text-destructive text-sm">
            <p>{t(personalFailureKey(ask.error))}</p>
            {wsId &&
              personalFailureKey(ask.error) ===
                'personal_workspace_unavailable' && (
                <MiraWorkspaceSettingsLink wsId={wsId} />
              )}
          </div>
        )}
        {accountId &&
          personalFailureKey(ask.error) === 'personal_consent_required' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                enable.reset();
                setConfirmEnable(true);
              }}
            >
              <LockKeyhole className="size-4" />
              {t('personal_enable')}
            </Button>
          )}
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          disabled={ask.isPending || enable.isPending || confirmEnable}
          aria-label={t('personal_chat')}
          placeholder={t('personal_chat_empty')}
        />
        <Button
          type="submit"
          disabled={!draft.trim() || ask.isPending}
          className="w-full"
        >
          {retryingDraft ? (
            <RefreshCw className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {ask.isPending
            ? t('mira_thinking')
            : retryingDraft
              ? liveT('retry')
              : t('send')}
        </Button>
      </form>
      <Dialog
        open={confirmEnable}
        onOpenChange={(open) => {
          if (!enable.isPending) setConfirmEnable(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('personal_enable')}</DialogTitle>
            <DialogDescription>{liveT('phase_notice')}</DialogDescription>
          </DialogHeader>
          {enable.isError && <p role="alert">{liveT('choice_failed')}</p>}
          <Button
            type="button"
            disabled={enable.isPending}
            onClick={() => enable.mutate()}
          >
            {liveT('phase_continue')}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={share !== null}
        onOpenChange={(open) => {
          if (!open && !publish.isPending) setShare(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('personal_share')}</DialogTitle>
            <DialogDescription>{t('personal_share_hint')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={share ?? ''}
            onChange={(event) => setShare(event.target.value)}
            maxLength={2000}
            disabled={publish.isPending}
            className="min-h-48"
            aria-label={t('personal_share')}
          />
          {publish.isError && (
            <p role="alert" className="text-destructive text-sm">
              {t('chat_send_failed')}
            </p>
          )}
          <Button
            disabled={!share?.trim() || publish.isPending}
            onClick={() => share && publish.mutate(share)}
          >
            <Share2 className="size-4" />
            {t('personal_share_confirm')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

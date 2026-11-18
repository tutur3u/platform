'use client';
import { useMutation } from '@tanstack/react-query';
import { LockKeyhole, Send, Share2 } from '@tuturuuu/icons';
import {
  askPersonalMeetAssistant,
  readPrivateMiraPolicy,
  setPrivateMiraChoice,
} from '@tuturuuu/internal-api';
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
import { MiraProfile } from './mira-profile';

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

type Turn = { id: string; body: string; assistant: boolean };
export function PersonalChat({
  meetingId,
  accountId,
  wsId,
  onShare,
}: {
  meetingId: string;
  accountId?: string;
  wsId?: string;
  onShare: (body: string) => Promise<unknown>;
}) {
  const t = useTranslations('meet.call');
  const liveT = useTranslations('meet.live');
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
      setHistory((current) =>
        [
          ...current,
          { id: crypto.randomUUID(), body: question, assistant: false },
          { id: crypto.randomUUID(), body: result.text, assistant: true },
        ].slice(-40)
      );
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
  const publish = useMutation({
    mutationFn: async (text: string) => {
      await onShare(text);
      setShare(null);
    },
  });
  return (
    <>
      <div className="flex gap-2 border-b bg-muted/30 px-4 py-3 text-muted-foreground text-xs">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" />
        <p>{t('personal_chat_hint')}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        <ol className="space-y-5" aria-live="polite">
          {history.map((turn) => (
            <li key={turn.id} className="space-y-2 text-sm">
              <div className="font-medium text-xs">
                {turn.assistant ? <MiraProfile /> : t('you')}
              </div>
              <ChatMessageBody body={turn.body} assistant={turn.assistant} />
              {turn.assistant && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    publish.reset();
                    setShare(turn.body.slice(0, 2000));
                  }}
                >
                  <Share2 className="size-3.5" />
                  {t('personal_share')}
                </Button>
              )}
            </li>
          ))}
        </ol>
        {!history.length && (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {t('personal_chat_empty')}
          </p>
        )}
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
          <Send className="size-4" />
          {t(ask.isPending ? 'mira_thinking' : 'send')}
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

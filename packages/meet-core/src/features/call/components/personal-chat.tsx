'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LockKeyhole } from '@tuturuuu/icons';
import {
  askPersonalMeetAssistant,
  confirmMeetMiraAccount,
  InternalApiError,
  readPrivateMiraPolicy,
  setPrivateMiraChoice,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { MEETING_APP } from '../../../runtime';
import { liveErrorMessageKey } from '../../live-assistant/live-errors';
import { useLiveSession } from '../../live-assistant/live-session-store';
import { MiraWorkspaceOff } from '../../live-assistant/mira-workspace-off';
import { confirmPrivateChoice } from '../../live-assistant/private-choice';
import { useMeetUxV2 } from '../prejoin/prejoin-context';
import { MiraConfirmDialog } from './mira-confirm-dialog';
import type { MiraPermissionsProps } from './mira-permissions-card';
import { EnableMiraDialog, ShareSnippetDialog } from './personal-chat-dialogs';
import { PersonalChatComposer } from './personal-chat-composer';
import { PersonalChatLiveStatus } from './personal-chat-live-status';
import {
  type MiraTutorReference,
  PersonalChatMessages,
  type Turn,
} from './personal-chat-messages';
import { PersonalChatToolbar } from './personal-chat-toolbar';
import { roomMiraConsentKey } from './room-mira-key';
import { useRoomMiraConsent } from './use-room-mira';

export type { MiraTutorReference };

const privateFailureKeys = {
  MIRA_ACCOUNT_UNAVAILABLE: 'personal_account_unavailable',
  MIRA_CONSENT_REQUIRED: 'personal_consent_required',
  MIRA_CREDITS_UNAVAILABLE: 'personal_credits_unavailable',
  MIRA_DEPLOYMENT_DISABLED: 'personal_deployment_unavailable',
  MIRA_DEPLOYMENT_UNAVAILABLE: 'personal_deployment_unavailable',
  MIRA_PRIVATE_OFF: 'personal_off_in_meeting',
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
  const locale = useLocale();
  const v2 = useMeetUxV2() && MEETING_APP === 'meet';
  const queryClient = useQueryClient();
  const roomConsent = useRoomMiraConsent(meetingId, false).data;
  const session = useLiveSession(meetingId, accountId);
  const [history, setHistory] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [confirmationIntent, setConfirmationIntent] = useState<
    'send' | 'talk' | null
  >(null);
  const awaitingConfirmation =
    confirmationIntent !== null &&
    (!roomConsent?.available ||
      roomConsent.accountConfirmation !== 'confirmed');
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
  const prepare = useMutation({
    mutationFn: async ({
      action,
      confirm,
    }: {
      action: 'send' | 'talk';
      confirm: boolean;
    }) => {
      const scope = { accountId, meetingId };
      const policy = await readPrivateMiraPolicy(meetingId);
      if (!accountId || policy.accountId !== accountId)
        throw new Error('Private Mira account changed');
      if (!policy.available)
        throw new InternalApiError(
          'Private Mira is unavailable',
          403,
          `MIRA_${(policy.unavailableReason ?? 'account').toUpperCase()}_UNAVAILABLE`
        );
      if (policy.choice && policy.choice.choice !== 'continue')
        throw new InternalApiError(
          'Private Mira is off in this meeting',
          403,
          'MIRA_PRIVATE_OFF'
        );
      if (policy.accountConfirmation === 'required') {
        if (!confirm) return { ...scope, action, needsConfirmation: true };
        const next = await confirmMeetMiraAccount(
          meetingId,
          accountId,
          locale
        );
        queryClient.setQueryData(roomMiraConsentKey(meetingId), next);
      } else if (policy.accountConfirmation !== 'confirmed') {
        throw new Error('Mira confirmation is unavailable');
      }
      if (!policy.choice)
        await setPrivateMiraChoice(
          meetingId,
          policy.version,
          'continue',
          accountId
        );
      return { ...scope, action, needsConfirmation: false };
    },
    onSuccess: (result) => {
      if (
        result.accountId !== activeScope.current.accountId ||
        result.meetingId !== activeScope.current.meetingId
      ) return;
      if (result.needsConfirmation) {
        setConfirmationIntent(result.action);
        return;
      }
      setConfirmationIntent(null);
      if (result.action === 'talk') void session?.controls.start();
      else if (draft.trim()) ask.mutate(draft.trim());
    },
  });
  const publish = useMutation({
    mutationFn: async (text: string) => {
      await onShare(text);
      setShare(null);
    },
  });
  const live =
    !!session && !['idle', 'error', 'ended'].includes(session.status);
  const liveReady =
    live &&
    session.mode === 'personal' &&
    ['listening', 'paused'].includes(session.status);
  const canTalk = !!session && !!session.accountId;
  const talk = () => {
    if (!session) return;
    if (v2) prepare.mutate({ action: 'talk', confirm: false });
    else if (session.accepted) void session.controls.start();
    else session.controls.openConsent();
  };
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (session && liveReady) {
      session.controls.send({ type: 'text', text });
      setDraft('');
      return;
    }
    if (ask.isPending || prepare.isPending) return;
    if (v2) prepare.mutate({ action: 'send', confirm: false });
    else ask.mutate(text);
  };
  const failure = prepare.isError
    ? personalFailureKey(prepare.error)
    : ask.isError
      ? personalFailureKey(ask.error)
      : null;
  return (
    <>
      {v2 && (
        <p className="text-muted-foreground text-xs">
          {liveT('private_notice_summary')}
        </p>
      )}
      {!v2 && (
        <PersonalChatToolbar
          voice={canTalk}
          voiceLocked={live}
          permissions={permissions}
        />
      )}
      <PersonalChatMessages
        history={history}
        session={session}
        pending={ask.isPending}
        referenceForAnswer={referenceForAnswer}
        onShare={(body) => {
          publish.reset();
          setShare(body);
        }}
        onTalk={canTalk && !live ? talk : undefined}
      />
      <PersonalChatComposer
        draft={draft}
        onDraft={setDraft}
        onSubmit={submit}
        onTalk={canTalk && !live ? talk : undefined}
        locked={
          ask.isPending ||
          enable.isPending ||
          confirmEnable ||
          prepare.isPending ||
          awaitingConfirmation
        }
        retrying={ask.isError && ask.variables === draft.trim()}
      >
        {failure === 'personal_workspace_unavailable' ? (
          <div
            role="alert"
            className="rounded-xl border bg-muted/35 p-3 text-sm"
          >
            <MiraWorkspaceOff wsId={wsId} />
          </div>
        ) : (
          failure && (
            <p role="alert" className="text-destructive text-sm">
              {t(failure)}
            </p>
          )
        )}
        {session?.error && (
          <p role="alert" className="text-destructive text-sm">
            {liveT(liveErrorMessageKey(session.error))}
          </p>
        )}
        {!v2 && accountId && failure === 'personal_consent_required' && (
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
        {live && session && <PersonalChatLiveStatus session={session} />}
      </PersonalChatComposer>
      {v2 ? (
        <MiraConfirmDialog
          open={awaitingConfirmation}
          pending={prepare.isPending}
          failed={prepare.isError}
          onDismiss={() => {
            prepare.reset();
            setConfirmationIntent(null);
          }}
          onConfirm={() =>
            confirmationIntent &&
            prepare.mutate({ action: confirmationIntent, confirm: true })
          }
        />
      ) : (
        <EnableMiraDialog
          open={confirmEnable}
          onOpenChange={setConfirmEnable}
          pending={enable.isPending}
          failed={enable.isError}
          onContinue={() => enable.mutate()}
        />
      )}
      <ShareSnippetDialog
        text={share}
        onText={setShare}
        onClose={() => setShare(null)}
        pending={publish.isPending}
        failed={publish.isError}
        onConfirm={(text) => publish.mutate(text)}
      />
    </>
  );
}

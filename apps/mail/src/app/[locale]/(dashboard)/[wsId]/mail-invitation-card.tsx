'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getMailInvitation,
  type MailCalendarResponse,
  respondToMailInvitation,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export function MailInvitationCard({
  workspaceId,
  mailboxId,
  messageId,
}: {
  workspaceId: string;
  mailboxId: string;
  messageId: string;
}) {
  const t = useTranslations('mail');
  const scope = JSON.stringify([workspaceId, mailboxId, messageId]);
  const attempt = useRef<{
    scope: string;
    response: MailCalendarResponse;
    requestId: string;
  } | null>(null);
  const [result, setResult] = useState<{
    scope: string;
    response: MailCalendarResponse;
    status: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ['mail', workspaceId, mailboxId, 'invitation', messageId],
    queryFn: () => getMailInvitation(workspaceId, mailboxId, messageId),
    staleTime: 60_000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (value: {
      response: MailCalendarResponse;
      requestId: string;
      scope: string;
    }) =>
      respondToMailInvitation(workspaceId, mailboxId, messageId, {
        response: value.response,
        requestId: value.requestId,
      }),
    retry: false,
    onSuccess: (reply, value) =>
      setResult({
        scope: value.scope,
        response: value.response,
        status: reply.status,
      }),
  });
  const invitation = query.data?.invitation;
  if (!invitation)
    return query.isError ? (
      <Button onClick={() => void query.refetch()} variant="ghost">
        {t('invitation_retry')}
      </Button>
    ) : null;
  const labels = {
    ACCEPTED: t('invitation_accept'),
    DECLINED: t('invitation_decline'),
    TENTATIVE: t('invitation_tentative'),
  };
  const current = result?.scope === scope ? result : invitation.reply;
  return (
    <section
      aria-label={t('invitation_title')}
      className="m-4 space-y-2 rounded-xl border p-4 md:mx-6"
    >
      <h3 className="font-medium">
        {invitation.summary || t('invitation_title')}
      </h3>
      <p className="break-all text-muted-foreground text-sm">
        {t('invitation_identity', {
          attendee: invitation.attendee,
          organizer: invitation.organizer,
        })}
      </p>
      <p className="text-sm">
        {t('invitation_when')}: {invitation.when}
      </p>
      {invitation.location && invitation.location !== invitation.joinUrl ? (
        <p className="whitespace-pre-wrap text-sm">
          {t('invitation_location')}: {invitation.location}
        </p>
      ) : null}
      {invitation.joinUrl ? (
        <Button asChild variant="outline">
          <a href={invitation.joinUrl} target="_blank" rel="noreferrer">
            {t('invitation_join')}
          </a>
        </Button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(labels) as MailCalendarResponse[]).map((response) => (
          <Button
            key={response}
            size="sm"
            variant={current?.response === response ? 'default' : 'outline'}
            disabled={
              mutation.isPending ||
              current?.status === 'sending' ||
              (current?.status === 'sent' && current.response === response)
            }
            onClick={() => {
              if (
                !attempt.current ||
                attempt.current.scope !== scope ||
                attempt.current.response !== response ||
                current?.status === 'sent'
              )
                attempt.current = {
                  scope,
                  response,
                  requestId:
                    invitation.reply?.response === response &&
                    invitation.reply.retryRequestId &&
                    current?.status !== 'sent'
                      ? invitation.reply.retryRequestId
                      : crypto.randomUUID(),
                };
              mutation.mutate(attempt.current);
            }}
          >
            {labels[response]}
          </Button>
        ))}
      </div>
      <p role="status" className="text-muted-foreground text-sm">
        {mutation.isPending
          ? t('invitation_sending')
          : mutation.isError || current?.status === 'failed'
            ? t('invitation_failed')
            : current?.status === 'sending'
              ? t('invitation_pending')
              : current?.status === 'sent'
                ? t('invitation_sent', { response: labels[current.response] })
                : ''}
      </p>
      {current?.status === 'sending' ||
      current?.status === 'failed' ||
      mutation.isError ? (
        <Button
          variant="ghost"
          disabled={query.isFetching}
          onClick={() => {
            setResult(null);
            void query.refetch();
          }}
        >
          {t('invitation_retry')}
        </Button>
      ) : null}
    </section>
  );
}

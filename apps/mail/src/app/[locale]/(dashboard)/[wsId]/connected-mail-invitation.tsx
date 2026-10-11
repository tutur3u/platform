'use client';
import { useMutation } from '@tanstack/react-query';
import {
  type ConnectedMailMessage,
  connectedMailRequest,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

export function ConnectedMailInvitation({
  workspaceId,
  accountId,
  message,
}: {
  workspaceId: string;
  accountId: string;
  message: ConnectedMailMessage;
}) {
  const t = useTranslations('mail');
  const requests = useRef(new Map<string, string>());
  const mutation = useMutation({
    retry: false,
    mutationFn: (response: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE') => {
      let requestId = requests.current.get(response);
      if (!requestId) {
        requestId = crypto.randomUUID();
        requests.current.set(response, requestId);
      }
      return connectedMailRequest(
        workspaceId,
        [accountId, 'messages', message.id, 'invitation'],
        { method: 'POST', body: { response, requestId } }
      );
    },
  });
  if (!message.invitation) return null;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p>{message.invitation.summary}</p>
      <p>{message.invitation.when}</p>
      <p>{message.invitation.location}</p>
      {message.invitation.joinUrl ? (
        <a
          className="underline"
          href={message.invitation.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('connected_join')}
        </a>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(['ACCEPTED', 'DECLINED', 'TENTATIVE'] as const).map((response) => (
          <Button
            key={response}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(response)}
          >
            {t(`connected_${response.toLowerCase()}`)}
          </Button>
        ))}
      </div>
      {mutation.isSuccess ? (
        <p role="status">{t('connected_response_sent')}</p>
      ) : null}
      {mutation.error ? (
        <p role="alert" className="text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  );
}

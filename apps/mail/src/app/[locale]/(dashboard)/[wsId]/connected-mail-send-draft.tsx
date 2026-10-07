'use client';
import { useMutation } from '@tanstack/react-query';
import { connectedMailRequest } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
export function ConnectedMailSendDraft({
  workspaceId,
  accountId,
  draftId,
  onSent,
}: {
  workspaceId: string;
  accountId: string;
  draftId: string;
  onSent: () => void;
}) {
  const t = useTranslations('mail');
  const [requestId] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    retry: false,
    mutationFn: () =>
      connectedMailRequest(workspaceId, [accountId, 'drafts', draftId], {
        method: 'POST',
        body: { requestId },
      }),
    onSuccess: onSent,
  });
  return (
    <div>
      <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {t('send')}
      </Button>
      {mutation.error ? (
        <p role="alert" className="text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  );
}

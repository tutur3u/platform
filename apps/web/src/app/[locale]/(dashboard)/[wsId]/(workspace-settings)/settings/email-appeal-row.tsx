'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type EmailAppealEntry,
  requestWorkspaceEmailAppeal,
} from '@tuturuuu/internal-api/email-appeals';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

function statusKey(status: string) {
  switch (status) {
    case 'waiting_recipient':
    case 'verifying':
    case 'dispatching':
    case 'sent':
    case 'unavailable':
    case 'pending':
    case 'confirmed':
    case 'transport_pending':
    case 'qualified':
    case 'failed':
    case 'expired':
    case 'reblocked':
      return status;
    default:
      return 'unknown';
  }
}

export default function EmailAppealRow({
  entry,
  wsId,
}: {
  entry: EmailAppealEntry;
  wsId: string;
}) {
  const t = useTranslations('email-appeals');
  const format = useFormatter();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [expanded, setExpanded] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      requestWorkspaceEmailAppeal(wsId, {
        email: entry.email,
        reason: reason.trim(),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['email-appeals', wsId] }),
    retry: false,
  });

  function feedback() {
    switch (mutation.status) {
      case 'idle':
        return null;
      case 'pending':
        return (
          <p role="status" className="text-muted-foreground text-sm">
            {t('requesting')}
          </p>
        );
      case 'error':
        return (
          <p role="alert" className="text-destructive text-sm">
            {t('request_error')}
          </p>
        );
      case 'success':
        return (
          <div className="space-y-2">
            <p role="status" className="text-sm">
              {t('admin_waiting_recipient')}
            </p>
            <Label htmlFor={`${reasonId}-recipient`}>
              {t('recipient_link')}
            </Label>
            <Input
              id={`${reasonId}-recipient`}
              readOnly
              value={mutation.data.recipientRequestPath}
              onFocus={(event) => event.target.select()}
            />
            <Button asChild variant="outline">
              <Link href={mutation.data.recipientRequestPath}>
                {t('open_recipient_page')}
              </Link>
            </Button>
          </div>
        );
      default: {
        const exhaustive: never = mutation;
        return exhaustive;
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="break-all font-medium text-sm">{entry.email}</p>
          <p className="text-muted-foreground text-sm">
            {t(`reasons.${entry.reason}`)}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('blocked_at', {
              date: format.dateTime(new Date(entry.createdAt), {
                dateStyle: 'medium',
              }),
            })}
          </p>
          {entry.sourceEvent ? (
            <p className="break-all text-muted-foreground text-xs">
              {t('source', { source: entry.sourceEvent })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {entry.status ? (
            <Badge variant="outline">
              {t(`statuses.${statusKey(entry.status)}`)}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={
              !entry.appealable ||
              [
                'waiting_recipient',
                'verifying',
                'dispatching',
                'sent',
                'confirmed',
                'unknown',
              ].includes(entry.status ?? '') ||
              (entry.cooldownUntil !== null &&
                Date.parse(entry.cooldownUntil) > Date.now())
            }
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {t('request')}
          </Button>
        </div>
      </div>
      {expanded ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Label htmlFor={reasonId}>{t('reason')}</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={2000}
            required
            disabled={mutation.isPending}
          />
          <p className="text-muted-foreground text-sm">
            {t('consent_required')}
          </p>
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              reason.trim().length < 10 ||
              mutation.isSuccess
            }
          >
            {mutation.isPending ? t('requesting') : t('submit')}
          </Button>
          {feedback()}
        </form>
      ) : null}
    </div>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CalendarLinkPreview,
  confirmMailCalendarLink,
  getMailCalendarLink,
  parseMailCalendarEventUrl,
  previewMailCalendarLink,
  unlinkMailCalendarLink,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMailActor } from '@/components/mail-actor-provider';

export function MailCalendarLink(props: {
  workspaceId: string;
  mailboxId: string;
  messageId: string;
}) {
  const actorId = useMailActor();
  if (!actorId) return null;
  const scope = JSON.stringify([
    actorId,
    props.workspaceId,
    props.mailboxId,
    props.messageId,
  ]);
  return <ScopedLink key={scope} actorId={actorId} {...props} />;
}
function ScopedLink({
  actorId,
  workspaceId,
  mailboxId,
  messageId,
}: {
  actorId: string;
  workspaceId: string;
  mailboxId: string;
  messageId: string;
}) {
  const t = useTranslations('mail');
  const client = useQueryClient();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<CalendarLinkPreview | null>(null);
  const [notice, setNotice] = useState('');
  const key = [
    'mail',
    workspaceId,
    mailboxId,
    'calendar-link',
    actorId,
    messageId,
  ];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getMailCalendarLink(workspaceId, mailboxId, messageId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async (action: 'preview' | 'confirm' | 'unlink') => {
      if (action !== 'preview') await client.cancelQueries({ queryKey: key });
      if (action === 'unlink') {
        const receipt = query.data?.association?.receipt;
        if (!receipt) return;
        const result = await unlinkMailCalendarLink(
          workspaceId,
          mailboxId,
          messageId,
          receipt
        );
        setNotice(
          result.status === 'unlinked'
            ? ''
            : result.status === 'unavailable'
              ? 'calendar_link_unavailable'
              : 'calendar_link_changed'
        );
        await client.invalidateQueries({ queryKey: key });
        return;
      }
      const selection = parseMailCalendarEventUrl(url);
      if (!selection) {
        setNotice('calendar_link_invalid');
        return;
      }
      if (action === 'preview') {
        const result = await previewMailCalendarLink(
          workspaceId,
          mailboxId,
          messageId,
          selection
        );
        setPreview(result.preview);
        setNotice(result.preview ? '' : 'calendar_link_unavailable');
        return;
      }
      if (!preview) return;
      const result = await confirmMailCalendarLink(
        workspaceId,
        mailboxId,
        messageId,
        {
          calendarWorkspaceId: preview.target.identity.workspaceId,
          eventId: preview.target.identity.eventId,
          receipt: preview.receipt,
        }
      );
      if (result.status === 'linked') {
        setPreview(null);
        setNotice('calendar_link_linked');
        await client.invalidateQueries({ queryKey: key });
      } else {
        setPreview(null);
        setNotice(
          result.status === 'unavailable'
            ? 'calendar_link_unavailable'
            : 'calendar_link_changed'
        );
      }
    },
    onError: () => setNotice('calendar_link_failed'),
    retry: false,
  });
  const target = query.data?.target;
  return (
    <div className="space-y-2 border-t pt-3">
      <h4 className="font-medium">{t('calendar_link_title')}</h4>
      <p className="text-muted-foreground text-sm">
        {t('calendar_link_notice')}
      </p>
      {target ? (
        <p className="text-sm">
          {target.title} · {target.accountLabel}
        </p>
      ) : null}
      {target?.calendarUrl ? (
        <Button asChild variant="outline">
          <a href={target.calendarUrl} target="_blank" rel="noreferrer">
            {t('calendar_link_open')}
          </a>
        </Button>
      ) : null}
      {query.data?.association ? (
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('unlink')}
        >
          {t('calendar_link_unlink')}
        </Button>
      ) : null}
      <label className="block text-sm">
        {t('calendar_link_url')}
        <Input
          value={url}
          disabled={mutation.isPending}
          onChange={(event) => {
            setUrl(event.target.value);
            setPreview(null);
            setNotice('');
          }}
        />
      </label>
      <Button
        variant="outline"
        disabled={mutation.isPending || !url.trim()}
        onClick={() => mutation.mutate('preview')}
      >
        {t('calendar_link_preview')}
      </Button>
      {preview ? (
        <section
          aria-label={t('calendar_link_preview')}
          className="space-y-2 rounded-lg border p-3"
        >
          <h5>{t('calendar_link_original')}</h5>
          <p>
            {preview.original.summary} · {preview.original.when}
          </p>
          <p className="break-all">
            {preview.invitation.organizer} → {preview.invitation.attendee}
          </p>
          <p className="whitespace-pre-wrap">{preview.original.location}</p>
          {preview.original.joinUrl ? (
            <a href={preview.original.joinUrl} target="_blank" rel="noreferrer">
              {t('invitation_join')}
            </a>
          ) : null}
          <h5>{t('calendar_link_selected')}</h5>
          <p>
            {preview.target.title} · {preview.target.accountLabel}
          </p>
          <p>
            {preview.target.start} – {preview.target.end}
          </p>
          <p>{preview.target.organizer}</p>
          {preview.target.authority.timeZone ? (
            <p>{preview.target.authority.timeZone}</p>
          ) : null}
          <p>
            {preview.target.authority.attendees
              .map((person) =>
                [person.name, person.email, person.responseStatus]
                  .filter(Boolean)
                  .join(' · ')
              )
              .join('; ')}
          </p>
          <p className="whitespace-pre-wrap">{preview.target.location}</p>
          {preview.target.joinUrl ? (
            <a href={preview.target.joinUrl} target="_blank" rel="noreferrer">
              {t('invitation_join')}
            </a>
          ) : null}
          <div className="flex gap-2">
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('confirm')}
            >
              {t('calendar_link_confirm')}
            </Button>
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => setPreview(null)}
            >
              {t('calendar_link_cancel')}
            </Button>
          </div>
        </section>
      ) : null}
      {notice ? <p role="status">{t(notice)}</p> : null}
      {query.isError ? (
        <Button variant="ghost" onClick={() => void query.refetch()}>
          {t('invitation_retry')}
        </Button>
      ) : null}
    </div>
  );
}

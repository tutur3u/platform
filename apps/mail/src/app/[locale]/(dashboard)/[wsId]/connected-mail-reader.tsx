'use client';
import type { ConnectedMailMessage } from '@tuturuuu/internal-api';
import { connectedMailPath } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { ConnectedMailInvitation } from './connected-mail-invitation';
import { ConnectedMailSendDraft } from './connected-mail-send-draft';

export function ConnectedMailReader({
  workspaceId,
  accountId,
  message,
  folder,
  onCompose,
  onAction,
  actionsPending,
  onSent,
}: {
  workspaceId: string;
  accountId: string;
  message: ConnectedMailMessage;
  folder: string;
  onCompose: (mode: 'reply' | 'reply_all' | 'forward' | 'edit') => void;
  onAction: (action: string) => void;
  actionsPending: boolean;
  onSent: () => void;
}) {
  const t = useTranslations('mail');
  return (
    <article className="min-w-0 space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">{message.subject}</h2>
      <p className="break-all text-muted-foreground text-sm">{message.from}</p>
      {folder === 'drafts' ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onCompose('edit')}>
            {t('connected_edit_draft')}
          </Button>
          <ConnectedMailSendDraft
            key={`${accountId}:${message.id}`}
            workspaceId={workspaceId}
            accountId={accountId}
            draftId={message.id}
            onSent={onSent}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(['reply', 'reply_all', 'forward'] as const).map((mode) => (
              <Button
                key={mode}
                variant="outline"
                onClick={() => onCompose(mode)}
              >
                {t(mode)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                'mark_read',
                'mark_unread',
                'archive',
                'trash',
                'restore',
                'star',
                'unstar',
              ] as const
            ).map((value) => (
              <Button
                key={value}
                variant="ghost"
                disabled={actionsPending}
                onClick={() => onAction(value)}
              >
                {t(value)}
              </Button>
            ))}
          </div>
        </>
      )}
      <ConnectedMailInvitation
        key={`${accountId}:${message.id}`}
        workspaceId={workspaceId}
        accountId={accountId}
        message={message}
      />
      {message.html ? (
        <iframe
          title={t('connected_body')}
          sandbox=""
          referrerPolicy="no-referrer"
          className="h-96 w-full rounded-lg border bg-background"
          srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>body{font:14px/1.5 system-ui;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>${message.html}</body></html>`}
        />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
          {message.text}
        </pre>
      )}
      {message.attachments?.map((file) => (
        <a
          key={file.id}
          className="block text-sm underline"
          href={
            connectedMailPath(workspaceId, [
              accountId,
              'messages',
              message.id,
              'attachments',
              file.id,
            ]) + (folder === 'drafts' ? '?draft=1' : '')
          }
        >
          {file.filename}
        </a>
      ))}
    </article>
  );
}

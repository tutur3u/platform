'use client';
import { useQuery } from '@tanstack/react-query';
import {
  getMeetDocument,
  type MeetingDocumentJoin,
} from '@tuturuuu/internal-api/meet-call';
import { RealtimeChannel } from '@tuturuuu/realtime/channels';
import {
  CloudflareDocumentProvider,
  collaborationColor,
  type DocumentCheckpointStatus,
  Y,
} from '@tuturuuu/realtime/documents';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { DocumentPresence } from './document-presence';
import { DocumentStatus } from './document-status';
export function DocumentPanel({
  meetingId,
  accountId,
}: {
  meetingId: string;
  accountId: string;
}) {
  const t = useTranslations('meet.collaboration');
  const query = useQuery({
    queryKey: ['meeting-document', meetingId, accountId],
    queryFn: () => getMeetDocument(meetingId),
    retry: false,
  });
  if (!query.data)
    return (
      <div className="p-4 text-muted-foreground text-sm">
        {query.isError ? t('unavailable') : t('connecting')}
      </div>
    );
  return (
    <DocumentEditor
      key={`${query.data.documentId}:${accountId}`}
      meetingId={meetingId}
      initial={query.data}
    />
  );
}
export function DocumentEditor({
  meetingId,
  initial,
  join = getMeetDocument,
}: {
  meetingId: string;
  initial: MeetingDocumentJoin;
  join?: typeof getMeetDocument;
}) {
  const t = useTranslations('meet.collaboration');
  const [doc] = useState(() => {
    const value = new Y.Doc();
    if (initial.state.length)
      Y.applyUpdate(value, Uint8Array.from(initial.state));
    return value;
  });
  const [provider, setProvider] = useState<CloudflareDocumentProvider | null>(
    null
  );
  const [connected, setConnected] = useState(false);
  const [checkpoint, setCheckpoint] = useState<DocumentCheckpointStatus | null>(
    null
  );
  const current = useRef<CloudflareDocumentProvider | null>(null);
  const cleanup = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (cleanup.current) {
      clearTimeout(cleanup.current);
      cleanup.current = null;
    }
    if (!current.current) {
      let first = true;
      const channel = new RealtimeChannel(
        `meeting-document-${meetingId}`,
        { config: { private: true } },
        async () => {
          if (first) {
            first = false;
            return initial;
          }
          return join(meetingId);
        }
      );
      const next = new CloudflareDocumentProvider(
        doc,
        channel,
        setConnected,
        setCheckpoint
      );
      next.awareness.setLocalStateField('user', {
        id: initial.user.id,
        name: initial.user.user_metadata.display_name,
        color: collaborationColor(initial.user.id),
      });
      current.current = next;
      setProvider(next);
    }
    return () => {
      const value = current.current;
      cleanup.current = setTimeout(() => {
        cleanup.current = null;
        if (value && current.current === value) {
          current.current = null;
          void value.destroy().finally(() => doc.destroy());
        }
      }, 100);
    };
  }, [doc, initial, join, meetingId]);
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-auto">
        {provider ? (
          <RichTextEditor
            className="rounded-none! border-0!"
            content={null}
            toolbarLeadingContent={
              <div className="flex items-center gap-2">
                <DocumentStatus
                  connected={connected}
                  checkpoint={checkpoint}
                  compact
                />
                <DocumentPresence
                  awareness={provider.awareness}
                  connected={connected}
                />
              </div>
            }
            toolbarToolsLabel={t('tools')}
            allowCollaboration
            yjsDoc={doc}
            yjsProvider={provider}
            collaborationUser={{
              id: initial.user.id,
              name: initial.user.user_metadata.display_name,
              color: collaborationColor(initial.user.id),
            }}
            writePlaceholder={t('placeholder')}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t('connecting')}</p>
        )}
      </div>
    </section>
  );
}

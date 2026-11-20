'use client';
import { useQuery } from '@tanstack/react-query';
import {
  getMeetDocument,
  type MeetingDocumentJoin,
} from '@tuturuuu/internal-api/meet-call';
import { RealtimeChannel } from '@tuturuuu/realtime/channels';
import {
  type Awareness,
  CloudflareDocumentProvider,
  collaborationColor,
  type DocumentCheckpointStatus,
  Y,
} from '@tuturuuu/realtime/documents';
import { meetingDocumentTopic } from '@tuturuuu/realtime/meet';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DocumentLoadState, retryDocumentLoad } from './document-load-state';
import { MIRA_CARET_SURFACE_CLASS_NAME } from './document-mira-presence';
import { DocumentPresence } from './document-presence';
import { DocumentStatus } from './document-status';

/** Exported so the layout contract can be asserted; jsdom computes no layout. */
export const DOCUMENT_SURFACE_CLASS_NAME =
  'rounded-none! border-0! px-6 pb-12 outline-none sm:px-8';
export type DocumentEditorRef = ComponentProps<
  typeof RichTextEditor
>['editorRef'];

/** Joins one tab's channel; the primary tab keeps the original room channel. */
export function DocumentTab({
  meetingId,
  accountId,
  tabId,
  admitted = true,
  onRequestAccess,
  editorRef,
  toolbarExtras,
}: {
  meetingId: string;
  accountId: string;
  tabId: string;
  admitted?: boolean;
  onRequestAccess?: () => Promise<unknown>;
  editorRef?: DocumentEditorRef;
  toolbarExtras?: (awareness: Awareness) => ReactNode;
}) {
  const query = useQuery({
    queryKey: ['meeting-document', meetingId, accountId, tabId],
    queryFn: () => getMeetDocument(meetingId, undefined, tabId),
    enabled: admitted,
    retry: retryDocumentLoad,
  });
  if (!query.data)
    return (
      <DocumentLoadState
        error={admitted ? query.error : null}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
        onRequestAccess={onRequestAccess}
      />
    );
  return (
    <DocumentEditor
      key={`${query.data.documentId}:${accountId}`}
      meetingId={meetingId}
      tabId={tabId}
      initial={query.data}
      join={() => getMeetDocument(meetingId, undefined, tabId)}
      editorRef={editorRef}
      toolbarExtras={toolbarExtras}
    />
  );
}

export function DocumentEditor({
  meetingId,
  initial,
  join = getMeetDocument,
  tabId = 'primary',
  editorRef,
  toolbarExtras,
}: {
  meetingId: string;
  initial: MeetingDocumentJoin;
  join?: (meetingId: string) => Promise<MeetingDocumentJoin>;
  tabId?: string;
  editorRef?: DocumentEditorRef;
  toolbarExtras?: (awareness: Awareness) => ReactNode;
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
        meetingDocumentTopic(meetingId, tabId),
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
  }, [doc, initial, join, meetingId, tabId]);
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-auto">
        {provider ? (
          <RichTextEditor
            // The surface itself is the panel: no inner frame, padding instead of
            // a border, and no focus ring (the caret and toolbar show focus).
            className={cn(
              DOCUMENT_SURFACE_CLASS_NAME,
              MIRA_CARET_SURFACE_CLASS_NAME
            )}
            fillHeight
            content={null}
            editorRef={editorRef}
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
                {toolbarExtras?.(provider.awareness)}
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
          <p className="px-6 py-4 text-muted-foreground text-sm">
            {t('connecting')}
          </p>
        )}
      </div>
    </section>
  );
}

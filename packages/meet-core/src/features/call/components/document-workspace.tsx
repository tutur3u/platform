'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listMeetDocuments,
  type MeetingDocumentCommand,
  type MeetingDocumentMiraEdit,
  type MeetingDocuments,
  updateMeetDocuments,
} from '@tuturuuu/internal-api/meet-call';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import {
  DocumentAssist,
  type MiraAssistEditor,
  type MiraInsertion,
} from './document-assist';
import { DocumentEdits } from './document-edits';
import { type DocumentEditorRef, DocumentTab } from './document-editor';
import { findMiraText, miraTextToContent } from './document-mira-edit';
import { MiraDocumentStatus } from './document-mira-presence';
import { DocumentTabs, useDocumentTabTitle } from './document-tabs';

const PRIMARY = 'primary';
const MAX_TABS = 12;
function untruncated(value: string) {
  return value.endsWith('…') ? null : value;
}

/** Room-scoped tabs, Mira's presence and her attributed edits around one live editor. */
export function DocumentWorkspace({
  meetingId,
  accountId,
}: {
  meetingId: string;
  accountId: string;
}) {
  const t = useTranslations('meet.collaboration');
  const title = useDocumentTabTitle();
  const client = useQueryClient();
  const key = ['meeting-documents', meetingId, accountId];
  const documents = useQuery({
    queryKey: key,
    queryFn: () => listMeetDocuments(meetingId),
    // Room messages carry no tab state, so the list follows a bounded poll
    // only while this panel is mounted and the page is visible.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const [selected, setSelected] = useState(PRIMARY);
  const editorRef: NonNullable<DocumentEditorRef> = useRef(null);
  const insertions = useRef(new Map<string, MiraInsertion>());
  const tabs = documents.data?.tabs ?? [];
  const activeTabId = tabs.some((tab) => tab.id === selected)
    ? selected
    : PRIMARY;
  const store = (next: MeetingDocuments) => client.setQueryData(key, next);
  const update = useMutation({
    mutationFn: (command: MeetingDocumentCommand) =>
      updateMeetDocuments(meetingId, command),
    onSuccess: (next, command) => {
      if (command.action === 'create') {
        const known = new Set(tabs.map((tab) => tab.id));
        const created = next.tabs.find(
          (tab) => !known.has(tab.id) && tab.createdBy === accountId
        );
        if (created) setSelected(created.id);
      }
      store(next);
    },
    onError: (error) => {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? error.status
          : undefined;
      toast.error(t(status === 409 ? 'document_limit' : 'documents_failed'));
    },
  });
  const mira = documents.data?.mira ?? null;
  const miraTab = mira ? tabs.find((tab) => tab.id === mira.activeTabId) : null;
  const edits = (documents.data?.edits ?? [])
    .filter((edit) => edit.tabId === activeTabId)
    .slice(-3)
    .reverse();

  function review(
    edit: MeetingDocumentMiraEdit,
    decision: 'accepted' | 'reverted'
  ) {
    if (decision === 'reverted') {
      const local = insertions.current.get(edit.id);
      const after = local?.after ?? untruncated(edit.after);
      const before = local?.before ?? untruncated(edit.before);
      const editor = editorRef.current as unknown as MiraAssistEditor | null;
      const range =
        editor && after ? findMiraText(editor.state.doc, after) : null;
      if (!editor || !range) {
        toast.error(t('mira_undo_unavailable'));
        return;
      }
      if (edit.action === 'refine' && before)
        editor
          .chain()
          .focus()
          .insertContentAt(range, miraTextToContent(before))
          .run();
      else editor.chain().focus().deleteRange(range).run();
    }
    update.mutate({ action: 'review', editId: edit.id, decision });
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {documents.data && (
        <DocumentTabs
          tabs={tabs}
          activeTabId={activeTabId}
          miraTabId={miraTab?.id}
          canCreate={tabs.length < MAX_TABS}
          canClose={(tab) => tab.createdBy === accountId}
          pending={update.isPending}
          onSelect={setSelected}
          onCreate={(kind) => update.mutate({ action: 'create', kind })}
          onRename={(tabId, value) =>
            update.mutate({ action: 'rename', tabId, title: value })
          }
          onClose={(tabId) => update.mutate({ action: 'close', tabId })}
        />
      )}
      {mira && miraTab && (
        <div className="flex shrink-0 items-center justify-end border-border border-b px-3 py-2">
          <MiraDocumentStatus
            here={miraTab.id === activeTabId}
            status={mira.status}
            section={mira.section}
            tabTitle={title(miraTab)}
            onJump={() => setSelected(miraTab.id)}
          />
        </div>
      )}
      <div className="min-h-0 flex-1">
        <DocumentTab
          key={activeTabId}
          meetingId={meetingId}
          accountId={accountId}
          tabId={activeTabId}
          editorRef={editorRef}
          toolbarExtras={
            documents.data
              ? (awareness) => (
                  <DocumentAssist
                    meetingId={meetingId}
                    tabId={activeTabId}
                    awareness={awareness}
                    editor={() =>
                      editorRef.current as unknown as MiraAssistEditor | null
                    }
                    onInserted={(insertion) => {
                      insertions.current.set(insertion.editId, insertion);
                      void client.invalidateQueries({ queryKey: key });
                    }}
                  />
                )
              : undefined
          }
        />
      </div>
      <DocumentEdits
        edits={edits}
        pending={update.isPending}
        canReview={(edit) => edit.askedBy === accountId}
        onReview={review}
      />
    </section>
  );
}

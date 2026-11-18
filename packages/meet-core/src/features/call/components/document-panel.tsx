'use client';
import { DocumentWorkspace } from './document-workspace';

export {
  DOCUMENT_SURFACE_CLASS_NAME,
  DocumentEditor,
  type DocumentEditorRef,
  DocumentTab,
} from './document-editor';

export function DocumentPanel({
  meetingId,
  accountId,
}: {
  meetingId: string;
  accountId: string;
}) {
  return <DocumentWorkspace meetingId={meetingId} accountId={accountId} />;
}

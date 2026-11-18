export {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
export * as Y from 'yjs';
export {
  DOCUMENT_CHECKPOINT_EVENT,
  type DocumentCheckpointStatus,
  documentCheckpointSchema,
} from './checkpoint';
export { collaborationColor } from './identity';
export { CloudflareDocumentProvider } from './provider';
export {
  MIRA_AWARENESS_CLIENT_ID,
  MIRA_DOCUMENT_COLOR,
  MIRA_DOCUMENT_USER_ID,
  type MiraAwareness,
  type MiraCursor,
  miraAwarenessRemoval,
  miraAwarenessUpdate,
  miraCaretName,
  miraCursorSchema,
  readMiraAwareness,
} from './mira-presence';

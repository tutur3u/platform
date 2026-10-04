import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';
export function richTextDocumentContent(update: Uint8Array) {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    return yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('prosemirror'));
  } finally {
    doc.destroy();
  }
}

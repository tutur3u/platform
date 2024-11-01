'use client';

import DocumentEditor from './editor';
import { useRoom } from '@liveblocks/react';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';

interface LiveblocksTipTapEditorProps {
  wsId: string;
  documentId: string;
}

const LiveblocksTipTapEditor: React.FC<LiveblocksTipTapEditorProps> = ({
  wsId,
  documentId,
}) => {
  const room = useRoom();
  const [doc, setDoc] = useState<Y.Doc>();
  const [provider, setProvider] = useState<LiveblocksYjsProvider>();

  useEffect(() => {
    const yDoc = new Y.Doc();
    const yProvider = new LiveblocksYjsProvider(room, yDoc);
    setDoc(yDoc);
    setProvider(yProvider);

    return () => {
      yDoc.destroy();
      yProvider.destroy();
    };
  }, [room]);

  return doc && provider ? (
    <TiptapEditor
      doc={doc}
      provider={provider}
      wsId={wsId}
      documentId={documentId}
    />
  ) : null;
};

const TiptapEditor: React.FC<{
  doc: Y.Doc;
  provider: LiveblocksYjsProvider;
  wsId: string;
  documentId: string;
}> = ({ doc, provider, wsId, documentId }) => {
  useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: doc }),
      CollaborationCursor.configure({ provider }),
    ],
  });

  return (
    <DocumentEditor wsId={wsId} docId={documentId} content={doc.toJSON()} />
  );
};

export default LiveblocksTipTapEditor;

'use client';

import { AdvancedEditor } from './advanced-editor';
import { createClient } from '@/utils/supabase/client';
import { JSONContent } from 'novel';
import { FC, useCallback } from 'react';

interface DocumentEditorProps {
  wsId: string;
  docId: string;
  content: JSONContent;
}

const DocumentEditor: FC<DocumentEditorProps> = ({ wsId, docId, content }) => {
  const onSave = useCallback(
    async (data: JSONContent) => {
      const { error } = await createClient()
        .from('workspace_documents')
        .update({ content: data })
        .eq('id', docId)
        .eq('ws_id', wsId);

      if (error) console.error('Save error:', error.message + ' ' + "wsId:", wsId + ' ' + "docId:", docId);
    },
    [wsId, docId]
  );

  return (
    <AdvancedEditor content={content} onSave={onSave} disableLocalStorage />
  );
};

export default DocumentEditor;

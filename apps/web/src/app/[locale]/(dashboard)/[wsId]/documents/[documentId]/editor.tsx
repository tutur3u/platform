'use client';

import { TailwindAdvancedEditor } from '../advanced-editor';
import { createClient } from '@/utils/supabase/client';
import { JSONContent } from 'novel';

export function DocumentEditor({
  wsId,
  docId,
  content,
}: {
  wsId: string;
  docId: string;
  content: JSONContent;
}) {
  const onSave = async (data: JSONContent) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_documents')
      .update({ content: data })
      .eq('id', docId)
      .eq('ws_id', wsId);

    if (error) {
      console.error('error', error);
    }
  };

  return (
    <TailwindAdvancedEditor
      content={content as JSONContent | undefined}
      onSave={onSave}
      disableLocalStorage
    />
  );
}

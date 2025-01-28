'use client';

import { BlockEditor } from '@/components/components/BlockEditor';

export function DocumentEditor({
  wsId,
  docId,
  content,
}: {
  wsId: string;
  docId: string;
  content: any;
}) {
  return (
    <BlockEditor
      wsId={wsId}
      docId={docId}
      document={content as any | undefined}
    />
  );
}

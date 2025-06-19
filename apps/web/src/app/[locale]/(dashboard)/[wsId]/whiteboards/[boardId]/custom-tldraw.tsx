'use client';

import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { type Editor, type TLStoreSnapshot, Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';

type Theme = 'system' | 'dark' | 'light';

export function CustomTldraw({
  initialData,
  persistenceKey,
}: {
  initialData?: TLStoreSnapshot;
  persistenceKey: string;
}) {
  const { resolvedTheme } = useTheme();
  const [editor, setEditor] = useState<Editor | null>(null);

  const handleMount = (editor: Editor) => {
    setEditor(editor);
    if (initialData) {
      editor.loadSnapshot(initialData);
    }
  };

  useEffect(() => {
    if (editor)
      editor.user?.updateUserPreferences({
        colorScheme: (resolvedTheme as Theme | undefined) || 'system',
      });
  }, [editor, resolvedTheme]);

  return (
    <div className="h-full w-full">
      {!editor && (
        <div className="absolute inset-0 z-10 flex h-full w-full items-center justify-center">
          <LoadingIndicator className="h-10 w-10" />
        </div>
      )}

      <Tldraw
        persistenceKey={`ws-${persistenceKey}-tldraw`}
        onMount={handleMount}
      />
    </div>
  );
}

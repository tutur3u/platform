import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { ArrowLeftIcon } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from 'tldraw';

export default function Toolbar({
  wsId,
  boardId,
}: {
  wsId: string;
  boardId: string;
}) {
  const supabase = createClient();

  const editor = useEditor();
  const { toast } = useToast();

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastSavedSnapshotRef = useRef<string | null>(null);

  // Initialize the last saved snapshot on mount
  useEffect(() => {
    if (editor && lastSavedSnapshotRef.current === null) {
      const currentSnapshot = JSON.stringify(editor.getSnapshot());
      lastSavedSnapshotRef.current = currentSnapshot;
    }
  }, [editor]);

  // Listen for changes in the editor
  useEffect(() => {
    if (!editor) return;

    const checkForChanges = () => {
      const currentSnapshot = JSON.stringify(editor.getSnapshot());
      const hasChanges = currentSnapshot !== lastSavedSnapshotRef.current;
      setHasUnsavedChanges(hasChanges);
    };

    // Check for changes on various editor events
    const unsubscribeHistory = editor.store.listen(() => {
      checkForChanges();
    });

    return () => {
      unsubscribeHistory();
    };
  }, [editor]);

  const generateThumbnail = useCallback(async () => {
    const shapeIds = editor.getCurrentPageShapeIds();
    if (shapeIds.size === 0) {
      throw new Error('No shapes on canvas');
    }

    const { blob } = await editor.toImage([...shapeIds], {
      format: 'png',
      background: true,
      scale: 0.3,
      padding: 16,
    });

    return blob;
  }, [editor]);

  const generateFileName = useCallback((name: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hours}-${minutes}-${seconds}-${name}`;
  }, []);

  const save = useCallback(async () => {
    try {
      const thumbnailBlob = await generateThumbnail();
      if (!thumbnailBlob) {
        throw new Error('Failed to generate thumbnail');
      }

      const thumbnailFileName = generateFileName(`${boardId}.png`);
      const thumbnailFile = new File([thumbnailBlob], thumbnailFileName, {
        type: 'image/png',
      });

      const { error: thumbnailError } = await supabase.storage
        .from('workspaces')
        .upload(
          `${wsId}/whiteboards/${boardId}/${thumbnailFileName}`,
          thumbnailFile
        );

      if (thumbnailError) throw thumbnailError;

      const { data: thumbnailUrl } = supabase.storage
        .from('workspaces')
        .getPublicUrl(`${wsId}/whiteboards/${boardId}/${thumbnailFileName}`);

      const snapshot = editor.getSnapshot();

      const { error: updateError } = await supabase
        .from('workspace_whiteboards')
        .update({
          snapshot: JSON.stringify(snapshot),
          thumbnail_url: thumbnailUrl.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', boardId);

      if (updateError) throw updateError;

      // Update the last saved snapshot reference
      lastSavedSnapshotRef.current = JSON.stringify(snapshot);
      setHasUnsavedChanges(false);

      toast({
        title: 'Saved successfully!',
        description: 'Your whiteboard has been saved.',
        variant: 'default',
      });
    } catch (error: unknown) {
      console.error(error);
      toast({
        title: 'Error saving',
        description: 'Failed to save whiteboard',
        variant: 'destructive',
      });
    }
  }, [
    editor,
    boardId,
    supabase,
    toast,
    wsId,
    generateFileName,
    generateThumbnail,
  ]);

  return (
    <div className="pointer-events-auto flex gap-4 p-4">
      <Link href={`/${wsId}/whiteboards`}>
        <Button variant="ghost">
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </Button>
      </Link>
      <Button variant="default" onClick={save} disabled={!hasUnsavedChanges}>
        Save Snapshot
      </Button>
    </div>
  );
}

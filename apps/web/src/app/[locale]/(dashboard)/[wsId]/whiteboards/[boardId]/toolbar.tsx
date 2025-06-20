import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { ArrowLeftIcon } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useCallback } from 'react';
import { useEditor } from 'tldraw';

export default function Toolbar({ boardId }: { boardId: string }) {
  const supabase = createClient();

  const editor = useEditor();
  const { toast } = useToast();

  const generateThumbnail = async () => {
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
  };

  const generateFileName = (name: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hours}-${minutes}-${seconds}-${name}`;
  };

  const save = useCallback(async () => {
    try {
      const thumbnailBlob = await generateThumbnail();
      const thumbnailFileName = generateFileName(`${boardId}.png`);
      const thumbnailFile = new File([thumbnailBlob], thumbnailFileName, {
        type: 'image/png',
      });

      const { error: thumbnailError } = await supabase.storage
        .from('whiteboards-thumbnails')
        .upload(thumbnailFileName, thumbnailFile);

      if (thumbnailError) throw thumbnailError;

      const { data: thumbnailUrl } = supabase.storage
        .from('whiteboards-thumbnails')
        .getPublicUrl(thumbnailFileName);

      const snapshot = editor.getSnapshot();

      await supabase
        .from('whiteboards')
        .update({
          snapshot: JSON.stringify(snapshot),
          thumbnail_url: thumbnailUrl.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', boardId);

      toast({
        title: 'Saved successfully!',
        description: 'Your whiteboard and thumbnail have been saved.',
        variant: 'default',
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Error saving',
        description: 'Failed to save whiteboard',
        variant: 'destructive',
      });
    }
  }, [editor]);

  return (
    <div className="pointer-events-auto flex gap-4 p-4">
      <Link href={`/whiteboards`}>
        <Button variant="ghost">
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </Button>
      </Link>
      <Button variant="default" onClick={save}>
        Save Snapshot
      </Button>
    </div>
  );
}

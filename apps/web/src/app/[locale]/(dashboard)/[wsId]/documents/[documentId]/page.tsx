'use client';

import { TailwindAdvancedEditor } from '../advanced-editor';
import DocumentShareDialog from '../document-share-dialog';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@repo/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { Share2 } from 'lucide-react';
import { JSONContent } from 'novel';
import { use, useEffect, useState } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    documentId: string;
  }>;
}

export default function DocumentDetailsPage({ params }: Props) {
  const { wsId, documentId } = use(params);
  const [document, setDocument] = useState<{
    id: string;
    name: string;
    content: JSONContent | null;
    isPublic: boolean;
  } | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  useEffect(() => {
    const fetchDocument = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('workspace_documents')
        .select('id, name, content, is_public')
        .eq('ws_id', wsId)
        .eq('id', documentId)
        .single();

      if (data) {
        setDocument({
          id: data.id,
          name: data.name ?? 'Untitled',
          content: data.content ? JSON.parse(data.content) : null,
          isPublic: data.is_public,
        });

        if (data.content) {
          window.localStorage.setItem('novel-content', data.content);
        }
      }
    };

    fetchDocument();
  }, [wsId, documentId]);

  useEffect(() => {
    const handleStorageChange = async () => {
      const content = window.localStorage.getItem('novel-content');
      if (content && document) {
        const supabase = createClient();
        await supabase
          .from('workspace_documents')
          .update({ content })
          .eq('id', documentId);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [documentId, document]);

  const handleUpdateVisibility = async (isPublic: boolean) => {
    if (document) {
      const supabase = createClient();
      await supabase
        .from('workspace_documents')
        .update({ is_public: isPublic })
        .eq('id', documentId);
      setDocument({ ...document, isPublic });
    }
  };

  if (!document) return null;

  return (
    <div className="relative w-full max-w-screen-lg">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{document.name}</h1>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'transition duration-300',
                !document.id
                  ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                  : 'pointer-events-auto ml-1 w-10 opacity-100'
              )}
              onClick={() => setIsShareDialogOpen(true)}
            >
              <Share2 />
              <span className="sr-only">Share</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share</TooltipContent>
        </Tooltip>
      </div>
      <TailwindAdvancedEditor />
      <DocumentShareDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        documentId={document.id}
        isPublic={document.isPublic}
        onUpdateVisibility={handleUpdateVisibility}
      />
    </div>
  );
}

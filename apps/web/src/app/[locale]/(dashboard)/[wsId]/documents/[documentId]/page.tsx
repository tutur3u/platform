'use client';

import LiveblockContainer from '../components/text-editor/liveblock-container';
import DocumentShareDialog from '../document-share-dialog';
import { cn } from '@/lib/utils';
import { WorkspaceDocument } from '@/types/db';
import { createClient } from '@/utils/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@repo/ui/components/ui/alert-dialog';
import { Button } from '@repo/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { Globe2, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    documentId: string;
  }>;
}

async function deleteDocument(wsId: string, documentId: string) {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/documents/${documentId}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to delete document');
  }
}

export default function DocumentDetailsPage({ params }: Props) {
  const t = useTranslations();
  const { wsId, documentId } = use(params);

  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<WorkspaceDocument | null>();

  useEffect(() => {
    getData(wsId, documentId).then((data) => {
      setDocument(data);
      setLoading(false);
    });
  }, [wsId, documentId]);

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (document) {
      try {
        setLoading(true);
        await deleteDocument(wsId, document.id);
        router.push(`/${wsId}/documents`);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handleUpdateVisibility = async (is_public: boolean) => {
    if (document) {
      const supabase = createClient();
      await supabase
        .from('workspace_documents')
        .update({ is_public })
        .eq('id', documentId);
      setDocument({ ...document, is_public });
    }
  };

  if (loading) return <div>{t('common.loading')}...</div>;
  if (!document) return null;

  return (
    <div className="relative w-full">
      <div className="mb-4 flex items-center justify-end">
        <h1 className="flex-grow text-2xl font-bold">{document.name}</h1>
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogTrigger asChild>
            <Button
              className="mr-2"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              {t('common.delete')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('common.confirm_delete_title')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('common.confirm_delete_description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'transition duration-300',
                !document.id
                  ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                  : 'pointer-events-auto w-10 opacity-100'
              )}
              onClick={() => setIsShareDialogOpen(true)}
            >
              {document.is_public ? <Globe2 /> : <Lock />}
              <span className="sr-only">{t('common.share')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.share')}</TooltipContent>
        </Tooltip>
      </div>

      {/* LiveBlock Collaborative Text Editor */}
      {/* <LiveblocksProvider>
        <Room wsID={wsId} documentID={documentId}>
          <DocumentEditor
            wsId={wsId}
            docId={documentId}
            content={document.content as JSONContent}
          />
        </Room>
      </LiveblocksProvider> */}
      <LiveblockContainer />

      <DocumentShareDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        documentId={document.id}
        isPublic={document.is_public!!}
        onUpdateVisibility={handleUpdateVisibility}
      />
    </div>
  );
}

const getData = async (wsId: string, docId: string) => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_documents')
    .select('*')
    .eq('id', docId)
    .eq('ws_id', wsId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data;
};

'use client';

import DocumentShareDialog from '../document-share-dialog';
import { BlockEditor } from '@/components/components/BlockEditor';
import { cn } from '@/lib/utils';
import { WorkspaceDocument } from '@/types/db';
import { createClient } from '@/utils/supabase/client';
// import { DocumentEditor } from './editor';
import { TiptapCollabProvider } from '@hocuspocus/provider';
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
import { Input } from '@repo/ui/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { Globe2, Lock } from 'lucide-react';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { JSONContent } from 'novel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Doc as YDoc } from 'yjs';

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
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [wsId, setWsId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<WorkspaceDocument | null>(null);
  const [saveStatus, setSaveStatus] = useState(t('common.saved'));
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const router = useRouter();
  const [provider] = useState<TiptapCollabProvider | null>(null);
  // const [collabToken, setCollabToken] = useState<string | null | undefined>();
  const [aiToken] = useState<string | null | undefined>();
  const hasCollab = true;
  const ydoc = useMemo(() => new YDoc(), []);
  useEffect(() => {
    params.then((resolvedParams) => {
      setWsId(resolvedParams.wsId);
      setDocumentId(resolvedParams.documentId);
    });
  }, [params]);

  useEffect(() => {
    if (wsId && documentId) {
      setLoading(true);
      getData(wsId, documentId).then((data) => {
        setDocument(data);
        setLoading(false);
      });
    }
  }, [wsId, documentId]);

  const handleDelete = async () => {
    if (document && wsId && documentId) {
      try {
        setLoading(true);
        await deleteDocument(wsId, document.id);
        router.push(`/${wsId}/documents`);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUpdateVisibility = async (is_public: boolean) => {
    if (document && documentId) {
      const supabase = createClient();
      await supabase
        .from('workspace_documents')
        .update({ is_public })
        .eq('id', documentId);
      setDocument({ ...document, is_public });
    }
  };

  const handleNameInputChange = () => {
    setSaveStatus(t('common.save'));
  };

  const handleNameChange = async () => {
    const newName = nameInputRef.current?.value;
    if (newName && document) {
      setSaveStatus(t('common.saving'));
      const supabase = createClient();
      await supabase
        .from('workspace_documents')
        .update({ name: newName })
        .eq('id', document.id);

      setDocument({ ...document, name: newName });
      setSaveStatus(t('common.saved'));
    }
  };

  if (loading || !wsId || !documentId) {
    return <div>{t('common.loading')}...</div>;
  }
  if (!document) return null;

  return (
    <div className="relative w-full">
      <div className="mb-4 flex items-center justify-end gap-2">
        <Input
          ref={nameInputRef}
          type="text"
          defaultValue={document.name || ''}
          className="flex-grow text-2xl"
          onChange={handleNameInputChange}
          onBlur={handleNameChange}
          onKeyDown={(e) => e.key === 'Enter' && handleNameChange()}
        />
        <div>
          {saveStatus === t('common.saved') ? (
            <CircleCheck className="h-7 w-7" />
          ) : (
            <CircleDashed className="h-7 w-7" />
          )}
        </div>
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogTrigger asChild>
            <Button onClick={() => setIsDeleteDialogOpen(true)}>
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

      {/* <DocumentEditor
        wsId={wsId}
        docId={documentId}
        content={document.content as JSONContent}
      /> */}
      <BlockEditor
        aiToken={aiToken ?? undefined}
        hasCollab={hasCollab}
        ydoc={ydoc}
        docId={documentId}
        document={document.content as JSONContent}
        provider={provider}
      />
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

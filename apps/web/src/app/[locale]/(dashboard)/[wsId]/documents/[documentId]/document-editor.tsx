'use client';

import type { JSONContent } from '@tiptap/react';
import {
  AlertCircle,
  ChevronLeft,
  CircleCheck,
  Globe2,
  Loader2,
  Lock,
  Share2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceDocument } from '@tuturuuu/types';
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
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import debounce from 'lodash/debounce';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DocumentShareDialog from '../document-share-dialog';

interface DocumentEditorProps {
  documentId: string;
  wsId: string;
  initialDocument: Partial<WorkspaceDocument> | null;
}

interface SyncStatus {
  type: 'saving' | 'saved' | 'error';
  message: string;
  timestamp: number;
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

export function DocumentEditor({
  documentId,
  wsId,
  initialDocument,
}: DocumentEditorProps) {
  const t = useTranslations();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const flushPendingRef = useRef<(() => JSONContent | null) | undefined>(
    undefined
  );

  const [document, setDocument] = useState<Partial<WorkspaceDocument> | null>(
    initialDocument
  );
  const [content, setContent] = useState<JSONContent | null>(() => {
    if (initialDocument?.content) {
      try {
        const parsed =
          typeof initialDocument.content === 'string'
            ? JSON.parse(initialDocument.content)
            : initialDocument.content;
        return parsed;
      } catch {
        const contentStr =
          typeof initialDocument.content === 'string'
            ? initialDocument.content
            : String(initialDocument.content);
        return {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: contentStr }],
            },
          ],
        };
      }
    }
    return null;
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    type: 'saved',
    message: t('common.saved'),
    timestamp: Date.now(),
  });
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const router = useRouter();

  // Debounced sync status update
  const updateSyncStatus = useMemo(
    () =>
      debounce((newStatus: SyncStatus) => {
        setSyncStatus({
          ...newStatus,
          timestamp: Date.now(),
        });
      }, 100),
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      updateSyncStatus.cancel();
    };
  }, [updateSyncStatus]);

  const handleDelete = async () => {
    if (document && wsId && documentId) {
      try {
        if (document.id) await deleteDocument(wsId, document.id);
        router.push(`/${wsId}/documents`);
      } catch (error) {
        console.error(error);
        updateSyncStatus({
          type: 'error',
          message: t('common.error_deleting'),
          timestamp: Date.now(),
        });
      }
    }
  };

  const handleUpdateVisibility = async (is_public: boolean) => {
    if (document && documentId) {
      updateSyncStatus({
        type: 'saving',
        message: t('common.updating'),
        timestamp: Date.now(),
      });

      try {
        const supabase = createClient();
        await supabase
          .from('workspace_documents')
          .update({ is_public })
          .eq('id', documentId);
        setDocument((prevDoc) => ({ ...prevDoc, is_public }));

        updateSyncStatus({
          type: 'saved',
          message: t('common.visibility_updated'),
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error(error);
        updateSyncStatus({
          type: 'error',
          message: t('common.error_updating_visibility'),
          timestamp: Date.now(),
        });
      }
    }
  };

  const handleNameInputChange = () => {
    updateSyncStatus({
      type: 'saving',
      message: t('common.saving'),
      timestamp: Date.now(),
    });
  };

  const handleNameChange = async () => {
    const newName = nameInputRef.current?.value;
    if (newName && document) {
      updateSyncStatus({
        type: 'saving',
        message: t('common.saving'),
        timestamp: Date.now(),
      });

      try {
        const supabase = createClient();
        if (!document.id) return;

        await supabase
          .from('workspace_documents')
          .update({ name: newName })
          .eq('id', document.id);

        setDocument((prevDoc) => ({ ...prevDoc, name: newName }));
        updateSyncStatus({
          type: 'saved',
          message: t('common.name_updated'),
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error(error);
        updateSyncStatus({
          type: 'error',
          message: t('common.error_updating_name'),
          timestamp: Date.now(),
        });
      }
    }
  };

  const saveContentToDatabase = useCallback(
    async (newContent: JSONContent | null) => {
      if (!document?.id) return;

      updateSyncStatus({
        type: 'saving',
        message: t('common.saving'),
        timestamp: Date.now(),
      });

      try {
        const supabase = createClient();
        const contentString = newContent ? JSON.stringify(newContent) : null;
        const { error } = await supabase
          .from('workspace_documents')
          .update({ content: contentString })
          .eq('id', document.id);

        if (error) throw error;

        updateSyncStatus({
          type: 'saved',
          message: t('common.saved'),
          timestamp: Date.now(),
        });

        return true;
      } catch (error) {
        console.error('Error saving document:', error);
        updateSyncStatus({
          type: 'error',
          message: t('common.error_saving'),
          timestamp: Date.now(),
        });
        throw error;
      }
    },
    [document?.id, t, updateSyncStatus]
  );

  const handleContentChange = useCallback(
    (newContent: JSONContent | null) => {
      setContent(newContent);
      saveContentToDatabase(newContent);
    },
    [saveContentToDatabase]
  );

  const handleRetrySave = useCallback(() => {
    if (flushPendingRef.current) {
      const currentContent = flushPendingRef.current();
      updateSyncStatus({
        type: 'saving',
        message: t('common.saving'),
        timestamp: Date.now(),
      });
      saveContentToDatabase(currentContent).catch(() => {
        updateSyncStatus({
          type: 'error',
          message: t('common.error_saving'),
          timestamp: Date.now(),
        });
      });
    }
  }, [t, saveContentToDatabase, updateSyncStatus]);

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      if (!wsId) {
        throw new Error('Workspace ID not found');
      }

      const supabase = createClient();

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${wsId}/documents/${fileName}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('workspaces')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('workspaces').getPublicUrl(data.path);

      return publicUrl;
    },
    [wsId]
  );

  if (!document) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="mb-2 font-semibold text-lg">Document not found</h2>
          <p className="mb-4 text-muted-foreground text-sm">
            The document you're looking for doesn't exist or you don't have
            access to it.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push(`/${wsId}/documents`)}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to documents
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-4 flex h-screen flex-col overflow-hidden">
      <div className="z-50 shrink-0 border-b bg-background">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => router.push(`/${wsId}/documents`)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Input
                ref={nameInputRef}
                type="text"
                defaultValue={document.name || ''}
                className="h-9 w-fit border bg-transparent px-2 font-medium text-lg focus-visible:ring-0"
                onChange={handleNameInputChange}
                onBlur={handleNameChange}
                onKeyDown={(e) => e.key === 'Enter' && handleNameChange()}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                      'cursor-default select-none hover:bg-muted/50',
                      syncStatus.type === 'saving' &&
                        'bg-muted/30 text-muted-foreground',
                      syncStatus.type === 'saved' && 'text-emerald-500',
                      syncStatus.type === 'error' &&
                        'text-destructive hover:bg-destructive/10'
                    )}
                  >
                    {syncStatus.type === 'saving' && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {syncStatus.type === 'saved' && (
                      <CircleCheck className="h-3.5 w-3.5" />
                    )}
                    {syncStatus.type === 'error' && (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  sideOffset={4}
                  className="text-xs"
                >
                  {syncStatus.type === 'error' ? (
                    <div className="flex flex-col gap-1">
                      <span>{t('common.save_failed')}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleRetrySave}
                      >
                        {t('common.retry_save')}
                      </Button>
                    </div>
                  ) : (
                    t('common.last_saved', {
                      time: new Date(syncStatus.timestamp).toLocaleTimeString(
                        undefined,
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      ),
                    })
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setIsShareDialogOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              {t('common.share')}
            </Button>

            <div className="mx-2 h-5 w-px bg-border" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'h-8 w-8 transition-colors',
                    !document.id && 'pointer-events-none opacity-50'
                  )}
                  onClick={() => setIsShareDialogOpen(true)}
                >
                  {document.is_public ? (
                    <Globe2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {document.is_public
                  ? t('common.public_document')
                  : t('common.private_document')}
              </TooltipContent>
            </Tooltip>

            <AlertDialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
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
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    {t('common.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <RichTextEditor
          content={content}
          onChange={handleContentChange}
          readOnly={false}
          writePlaceholder={t('documents.start_writing')}
          className="h-full flex-1 border-0 p-4 focus-visible:outline-0 focus-visible:ring-0 md:p-8"
          workspaceId={wsId}
          onImageUpload={handleImageUpload}
          flushPendingRef={flushPendingRef}
        />
      </div>

      {document.id && (
        <DocumentShareDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          documentId={document.id}
          isPublic={document.is_public!}
          onUpdateVisibility={handleUpdateVisibility}
        />
      )}
    </div>
  );
}

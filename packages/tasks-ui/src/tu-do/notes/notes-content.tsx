'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { NoteEditDialog } from './note-edit-dialog';
import NoteList from './note-list';

// Helper to convert plain text to TipTap JSONContent
const textToJSONContent = (text: string): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text,
        },
      ],
    },
  ],
});

interface NotesContentProps {
  wsId: string;
}

export default function NotesContent({ wsId }: NotesContentProps) {
  const t = useTranslations('dashboard.bucket_dump');
  const queryClient = useQueryClient();

  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState<JSONContent | null>(null);
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);

  // Create note mutation with null title
  const createNoteMutation = useMutation({
    mutationFn: async () => {
      const emptyContent = textToJSONContent('');
      const response = await fetch(`/api/v1/workspaces/${wsId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: null, // Create with null title as per requirements
          content: emptyContent,
        }),
      });
      if (!response.ok) throw new Error(t('errors.create_note'));
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(t('success.note_created'));
      queryClient.invalidateQueries({ queryKey: ['workspace', wsId, 'notes'] });

      // Open the edit dialog with the newly created note
      setCreatedNoteId(data.id);
      setEditTitle('');
      setEditContent(textToJSONContent(''));
      setIsEditDialogOpen(true);
      setIsCreatingNote(false);
    },
    onError: () => {
      toast.error(t('errors.create_note'));
      setIsCreatingNote(false);
    },
  });

  // Update note mutation for auto-save in dialog
  const updateNoteMutation = useMutation({
    mutationFn: async ({
      noteId,
      title,
      content,
    }: {
      noteId: string;
      title?: string;
      content?: JSONContent;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/notes/${noteId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, content }),
        }
      );

      if (!response.ok) {
        throw new Error(t('errors.update_note'));
      }

      return response.json();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.update_note'));
    },
  });

  const handleCreateNewNote = async () => {
    setIsCreatingNote(true);
    createNoteMutation.mutate();
  };

  const handleTitleChange = (newTitle: string) => {
    setEditTitle(newTitle);
    if (createdNoteId && newTitle) {
      updateNoteMutation.mutate({
        noteId: createdNoteId,
        title: newTitle,
      });
    }
  };

  const handleContentChange = (newContent: JSONContent | null) => {
    setEditContent(newContent);
    if (createdNoteId && newContent) {
      updateNoteMutation.mutate({
        noteId: createdNoteId,
        content: newContent,
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header with New Note button */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="font-bold text-2xl">{t('notes_heading')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <Button
          onClick={handleCreateNewNote}
          disabled={isCreatingNote}
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('create_note_button')}
        </Button>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <NoteList wsId={wsId} />
      </div>

      {/* Edit Dialog for newly created note */}
      <NoteEditDialog
        isOpen={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditDialogOpen(false);
            setCreatedNoteId(null);
            setEditTitle('');
            setEditContent(null);
            // Refresh the notes list when dialog closes
            queryClient.invalidateQueries({
              queryKey: ['workspace', wsId, 'notes'],
            });
          }
        }}
        title={editTitle}
        onTitleChange={handleTitleChange}
        content={editContent}
        onContentChange={handleContentChange}
      />
    </div>
  );
}

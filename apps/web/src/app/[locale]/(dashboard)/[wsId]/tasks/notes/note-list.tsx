'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import {
  Archive,
  CheckCircle,
  Edit3,
  FileText,
  Loader2,
  MoreVertical,
  Trash2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { Textarea } from '@tuturuuu/ui/textarea';
import debounce from 'lodash/debounce';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { NoteEditDialog } from './note-edit-dialog';

interface Note {
  id: string;
  title: string | null;
  content: JSONContent;
  created_at: string;
  updated_at: string;
  archived: boolean;
}

interface WorkspaceBoardResponse {
  boards?: BoardWithLists[];
}

interface BoardWithLists {
  id: string;
  name: string | null;
  task_lists?: TaskList[] | null;
}

interface TaskList {
  id: string;
  name: string | null;
  status: string | null;
  position?: number | null;
}

interface ConversionResponse {
  success: boolean;
  message: string;
  data?: {
    taskId?: string;
    projectId?: string;
  };
}

const COMPLETED_STATUSES = new Set(['done', 'closed']);

// Helper function to extract plain text from JSONContent
const extractTextFromContent = (content: JSONContent): string => {
  if (!content) return '';

  if (content.text) return content.text;

  if (content.content && Array.isArray(content.content)) {
    return content.content.map(extractTextFromContent).join(' ');
  }

  return '';
};

export default function NoteList({ wsId }: { wsId: string }) {
  const t = useTranslations('dashboard.bucket_dump');
  const locale = useLocale();

  const [isConversionDialogOpen, setIsConversionDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState<JSONContent | null>(null);
  const [conversionType, setConversionType] = useState<'task' | 'project'>(
    'task'
  );
  const [selectedListId, setSelectedListId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Fetch notes (server-driven archived filter)
  const {
    data: notes = [],
    isLoading: notesLoading,
    refetch: refetchNotes,
  } = useQuery<Note[]>({
    queryKey: [
      'workspace',
      wsId,
      'notes',
      showArchived ? 'archived' : 'active',
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/notes?archived=${showArchived ? '1' : '0'}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        throw new Error(t('errors.fetch_notes'));
      }

      const notes = (await response.json()) as Note[];

      // Parse content if it's a string (safeguard for JSONB serialization issues)
      return notes.map((note) => ({
        ...note,
        content:
          typeof note.content === 'string'
            ? JSON.parse(note.content)
            : note.content,
      }));
    },
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });

  // Fetch boards and lists for task conversion
  const { data: boardsData, isLoading: boardsLoading } =
    useQuery<WorkspaceBoardResponse>({
      queryKey: ['workspace', wsId, 'boards-with-lists'],
      queryFn: async () => {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/boards-with-lists`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error(t('errors.fetch_boards'));
        }

        return (await response.json()) as WorkspaceBoardResponse;
      },
      enabled: Boolean(wsId),
      staleTime: 60_000,
    });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/notes/${noteId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error(t('errors.delete_note'));
      }
    },
    onSuccess: () => {
      toast.success(t('success.note_deleted'));
      refetchNotes();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.delete_note'));
    },
  });

  // Update note mutation
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

  // Convert note to task mutation
  const convertToTaskMutation = useMutation<
    ConversionResponse,
    Error,
    { noteId: string; listId: string }
  >({
    mutationFn: async ({ noteId, listId }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/notes/${noteId}/convert-to-task`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listId }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || t('errors.convert_to_task'));
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.converted_to_task'));
      setIsConversionDialogOpen(false);
      setSelectedNote(null);
      refetchNotes();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.convert_to_task'));
    },
  });

  // Convert note to project mutation
  const convertToProjectMutation = useMutation<
    ConversionResponse,
    Error,
    { noteId: string; name: string; description: string }
  >({
    mutationFn: async ({ noteId, name, description }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/notes/${noteId}/convert-to-project`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, description }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || t('errors.convert_to_project'));
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.converted_to_project'));
      setIsConversionDialogOpen(false);
      setSelectedNote(null);
      setProjectName('');
      setProjectDescription('');
      refetchNotes();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.convert_to_project'));
    },
  });

  const handleDeleteNote = (noteId: string) => {
    deleteNoteMutation.mutate(noteId);
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setEditTitle(note.title || '');
    // Parse content if it's a string (safeguard for JSONB serialization issues)
    const parsedContent =
      typeof note.content === 'string'
        ? JSON.parse(note.content)
        : note.content;
    setEditContent(parsedContent);
    setIsEditDialogOpen(true);
  };

  const debouncedTitleSave = useMemo(
    () =>
      debounce((noteId: string, title: string) => {
        updateNoteMutation.mutate({
          noteId,
          title,
        });
      }, 1000),
    [updateNoteMutation]
  );

  const handleAutoSaveTitle = useCallback(
    (title: string) => {
      if (!editingNote) return;
      debouncedTitleSave(editingNote.id, title);
    },
    [editingNote, debouncedTitleSave]
  );

  // Debounced auto-save handler - triggered 1 second after last change
  const debouncedAutoSave = useMemo(
    () =>
      debounce((noteId: string, content: JSONContent) => {
        updateNoteMutation.mutate({
          noteId,
          content,
        });
      }, 1000),
    [updateNoteMutation]
  );

  // Auto-save handler - debounced save triggered by changes
  const handleAutoSaveNote = useCallback(
    (content: JSONContent | null) => {
      if (!editingNote || !content) return;
      debouncedAutoSave(editingNote.id, content);
    },
    [editingNote, debouncedAutoSave]
  );

  const handleConvertNote = (note: Note) => {
    const plainText = extractTextFromContent(note.content);
    setSelectedNote(note);
    setProjectName(plainText.slice(0, 100)); // Use first 100 chars as default name
    setProjectDescription(plainText);
    setIsConversionDialogOpen(true);
  };

  const handleConfirmConversion = () => {
    if (!selectedNote) return;

    if (conversionType === 'task') {
      if (!selectedListId) {
        toast.error(t('errors.no_list_selected'));
        return;
      }
      convertToTaskMutation.mutate({
        noteId: selectedNote.id,
        listId: selectedListId,
      });
    } else {
      if (!projectName.trim()) {
        toast.error(t('errors.empty_project_name'));
        return;
      }
      convertToProjectMutation.mutate({
        noteId: selectedNote.id,
        name: projectName.trim(),
        description: projectDescription.trim() || '',
      });
    }
  };

  const listOptions = useMemo(
    () =>
      boardsData?.boards?.flatMap((board) => {
        const orderedLists = [...(board.task_lists ?? [])].sort((a, b) => {
          const aPosition = a.position ?? Number.MAX_SAFE_INTEGER;
          const bPosition = b.position ?? Number.MAX_SAFE_INTEGER;
          return aPosition - bPosition;
        });

        return orderedLists
          .filter((list) => {
            const normalizedStatus = (list.status ?? '').toLowerCase();
            return !COMPLETED_STATUSES.has(normalizedStatus);
          })
          .map((list) => ({
            id: list.id,
            name: list.name,
            boardId: board.id,
            boardName: board.name,
            status: list.status,
            position: list.position ?? undefined,
          }));
      }) ?? [],
    [boardsData]
  );

  const displayedNotes = notes;
  const isLoading = notesLoading;
  const isDeleting = deleteNoteMutation.isPending;
  const isUpdating = updateNoteMutation.isPending;
  const isConverting =
    convertToTaskMutation.isPending || convertToProjectMutation.isPending;

  return (
    <>
      <div className="space-y-4">
        {/* Header with archived toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">
              {showArchived ? t('archived_notes_heading') : t('notes_heading')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {showArchived
                ? t('archived_description')
                : t('active_description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {displayedNotes.length}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? t('show_active') : t('show_archived')}
            </Button>
          </div>
        </div>

        {/* Notes list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-dynamic-purple" />
          </div>
        ) : displayedNotes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 font-medium">
                {showArchived ? t('no_archived_notes') : t('no_notes')}
              </p>
              <p className="mt-2 text-center text-muted-foreground text-sm">
                {showArchived
                  ? t('no_archived_notes_description')
                  : t('no_notes_description')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {displayedNotes.map((note) => (
              <Card
                key={note.id}
                onClick={() => handleEditNote(note)}
                className={`group cursor-pointer transition ${
                  note.archived
                    ? 'border-dynamic-green/30 bg-dynamic-green/5'
                    : 'hover:border-dynamic-purple/30 hover:shadow-md'
                }`}
              >
                <CardContent className="flex h-full flex-col p-4">
                  {/* Header with title and actions */}
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <h3
                      className={`flex-1 font-bold text-base leading-tight ${
                        note.archived
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground'
                      }`}
                    >
                      {note.title || t('untitled_note')}
                    </h3>
                    <div
                      className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={
                              isConverting ||
                              isDeleting ||
                              isUpdating ||
                              note.archived
                            }
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!note.archived ? (
                            <>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConvertNote(note);
                                }}
                                disabled={isConverting}
                              >
                                <CheckCircle className="mr-2 h-4 w-4 text-dynamic-green" />
                                {t('actions.convert')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditNote(note);
                                }}
                                disabled={isUpdating}
                              >
                                <Edit3 className="mr-2 h-4 w-4 text-dynamic-blue" />
                                {t('actions.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNote(note.id);
                                }}
                                disabled={isDeleting}
                                className="text-dynamic-red focus:text-dynamic-red"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('actions.delete')}
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem disabled>
                              <Archive className="mr-2 h-4 w-4 text-muted-foreground" />
                              {t('actions.archived')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="mb-3 flex items-center gap-2">
                    <p className="text-muted-foreground text-xs">
                      {new Date(note.created_at).toLocaleDateString(locale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                    {note.archived && (
                      <Badge
                        variant="outline"
                        className="text-dynamic-green text-xs"
                      >
                        {t('actions.archived')}
                      </Badge>
                    )}
                  </div>

                  {/* Read-only TipTap editor with limited height */}
                  <div className="relative flex-1">
                    <div className="pointer-events-none h-[256px] overflow-hidden">
                      <RichTextEditor
                        content={note.content}
                        readOnly={true}
                        className="border-0 p-0! text-sm"
                      />
                    </div>
                    {/* Fade gradient at bottom */}
                    <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-12 bg-linear-to-t from-background to-transparent" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Note Dialog */}
      <NoteEditDialog
        isOpen={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditDialogOpen(false);
            setEditingNote(null);
            setEditTitle('');
            setEditContent(null);
            refetchNotes();
          }
        }}
        title={editTitle}
        onTitleChange={(newTitle) => {
          setEditTitle(newTitle);
          if (newTitle) {
            handleAutoSaveTitle(newTitle);
          }
        }}
        content={editContent}
        onContentChange={(newContent) => {
          setEditContent(newContent);
          // Trigger auto-save when content changes
          if (newContent) {
            handleAutoSaveNote(newContent);
          }
        }}
      />

      {/* Conversion Dialog */}
      <Dialog
        open={isConversionDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsConversionDialogOpen(false);
            setSelectedNote(null);
            setProjectName('');
            setProjectDescription('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('conversion_dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('conversion_dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Conversion type selection */}
            <div className="space-y-2">
              <Label className="font-medium text-sm">
                {t('conversion_dialog.type_label')}
              </Label>
              <Select
                value={conversionType}
                onValueChange={(value: 'task' | 'project') =>
                  setConversionType(value)
                }
                disabled={isConverting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">
                    {t('conversion_dialog.type_task')}
                  </SelectItem>
                  <SelectItem value="project">
                    {t('conversion_dialog.type_project')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Task list selection (only for task conversion) */}
            {conversionType === 'task' && (
              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  {t('conversion_dialog.list_label')}
                </Label>
                {listOptions.length > 0 ? (
                  <Select
                    value={selectedListId}
                    onValueChange={setSelectedListId}
                    disabled={isConverting}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('conversion_dialog.list_placeholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {listOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.boardName} • {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-center">
                    <p className="text-muted-foreground text-sm">
                      {boardsLoading
                        ? t('conversion_dialog.loading_lists')
                        : t('conversion_dialog.no_lists')}
                    </p>
                    {!boardsLoading && (
                      <p className="mt-1 text-muted-foreground text-xs">
                        {t('conversion_dialog.create_list_hint')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Project name and description (only for project conversion) */}
            {conversionType === 'project' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="project-name" className="font-medium text-sm">
                    {t('conversion_dialog.project_name_label')}
                  </Label>
                  <Input
                    id="project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t(
                      'conversion_dialog.project_name_placeholder'
                    )}
                    disabled={isConverting}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="project-description"
                    className="font-medium text-sm"
                  >
                    {t('conversion_dialog.project_description_label')}
                  </Label>
                  <Textarea
                    id="project-description"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder={t(
                      'conversion_dialog.project_description_placeholder'
                    )}
                    disabled={isConverting}
                    className="min-h-[100px]"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsConversionDialogOpen(false)}
              disabled={isConverting}
            >
              {t('conversion_dialog.cancel')}
            </Button>
            <Button
              onClick={handleConfirmConversion}
              disabled={
                isConverting ||
                (conversionType === 'task' && !selectedListId) ||
                (conversionType === 'project' && !projectName.trim())
              }
            >
              {isConverting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('conversion_dialog.converting')}
                </>
              ) : (
                t('conversion_dialog.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

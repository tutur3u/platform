'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Globe,
  KanbanSquare,
  ListTodo,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Plus,
  Share2,
  Tags,
  Trash2,
  UserPlus,
  Users,
  X,
} from '@tuturuuu/icons';
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useState } from 'react';
import type { BoardTemplateWithContent } from '../types';

interface TemplateShare {
  id: string;
  user_id: string | null;
  email: string | null;
  permission: string;
  created_at: string;
}

interface Props {
  wsId: string;
  template: BoardTemplateWithContent;
}

export default function TemplateDetailClient({ wsId, template }: Props) {
  const t = useTranslations('ws-board-templates');
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUsing, setIsUsing] = useState(false);
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Share management state
  const [shares, setShares] = useState<TemplateShare[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [isAddingShare, setIsAddingShare] = useState(false);
  const [isDeletingShare, setIsDeletingShare] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');

  // Edit form state
  const [editName, setEditName] = useState(template.name);
  const [editDescription, setEditDescription] = useState(
    template.description || ''
  );
  const [editVisibility, setEditVisibility] = useState(template.visibility);

  // Use form state
  const [newBoardName, setNewBoardName] = useState(`${template.name} Copy`);

  const nameId = useId();
  const descId = useId();
  const visibilityId = useId();
  const boardNameId = useId();
  const shareEmailId = useId();

  // Fetch shares when dialog opens (only for private templates owned by user)
  const fetchShares = useCallback(async () => {
    if (!template.isOwner || template.visibility !== 'private') return;

    setIsLoadingShares(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${template.id}/shares`
      );

      if (response.ok) {
        const data = await response.json();
        setShares(data.shares || []);
      }
    } catch (error) {
      console.error('Error fetching shares:', error);
    } finally {
      setIsLoadingShares(false);
    }
  }, [wsId, template.id, template.isOwner, template.visibility]);

  useEffect(() => {
    if (shareDialogOpen) {
      fetchShares();
    }
  }, [shareDialogOpen, fetchShares]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${template.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete template');
      }

      toast.success(t('detail.delete_success'));
      router.push(`/${wsId}/tasks/templates`);
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error(
        error instanceof Error ? error.message : t('detail.delete_error')
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = async () => {
    if (!editName.trim()) {
      toast.error(t('detail.name_required'));
      return;
    }

    setIsEditing(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${template.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editName.trim(),
            description: editDescription.trim() || null,
            visibility: editVisibility,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update template');
      }

      toast.success(t('detail.update_success'));
      setEditDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error(
        error instanceof Error ? error.message : t('detail.update_error')
      );
    } finally {
      setIsEditing(false);
    }
  };

  const handleUseTemplate = async () => {
    if (!newBoardName.trim()) {
      toast.error(t('detail.board_name_required'));
      return;
    }

    setIsUsing(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${template.id}/use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boardName: newBoardName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create board from template');
      }

      toast.success(t('detail.use_success'), {
        description: t('detail.use_success_description', {
          lists: data.stats.listsCreated,
          tasks: data.stats.tasksCreated,
        }),
      });

      setUseDialogOpen(false);
      router.push(`/${wsId}/tasks/boards/${data.board.id}`);
    } catch (error) {
      console.error('Error using template:', error);
      toast.error(
        error instanceof Error ? error.message : t('detail.use_error')
      );
    } finally {
      setIsUsing(false);
    }
  };

  const handleAddShare = async () => {
    if (!shareEmail.trim()) {
      toast.error(t('share.email_required'));
      return;
    }

    // Basic email validation
    if (!shareEmail.includes('@')) {
      toast.error(t('share.invalid_email'));
      return;
    }

    setIsAddingShare(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${template.id}/shares`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: shareEmail.trim().toLowerCase() }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to share template');
      }

      toast.success(t('share.add_success'));
      setShareEmail('');
      fetchShares();
    } catch (error) {
      console.error('Error adding share:', error);
      toast.error(
        error instanceof Error ? error.message : t('share.add_error')
      );
    } finally {
      setIsAddingShare(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    setIsDeletingShare(shareId);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${template.id}/shares?shareId=${shareId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove share');
      }

      toast.success(t('share.remove_success'));
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (error) {
      console.error('Error removing share:', error);
      toast.error(
        error instanceof Error ? error.message : t('share.remove_error')
      );
    } finally {
      setIsDeletingShare(null);
    }
  };

  const visibilityIcon =
    template.visibility === 'private' ? (
      <Lock className="h-4 w-4" />
    ) : template.visibility === 'workspace' ? (
      <Users className="h-4 w-4" />
    ) : (
      <Globe className="h-4 w-4" />
    );

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href={`/${wsId}/tasks/templates`}
        className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('detail.back_to_templates')}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <Bookmark className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-2xl tracking-tight">
                {template.name}
              </h1>
              <Badge
                variant="outline"
                className={cn(
                  'flex items-center gap-1',
                  template.visibility === 'private' &&
                    'border-dynamic-orange/30 text-dynamic-orange',
                  template.visibility === 'workspace' &&
                    'border-dynamic-blue/30 text-dynamic-blue',
                  template.visibility === 'public' &&
                    'border-dynamic-green/30 text-dynamic-green'
                )}
              >
                {visibilityIcon}
                {t(`visibility.${template.visibility}`)}
              </Badge>
            </div>
            {template.description && (
              <p className="mt-1 text-muted-foreground">
                {template.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-4 text-muted-foreground text-sm">
              <div className="flex items-center gap-1">
                <KanbanSquare className="h-4 w-4" />
                <span>
                  {template.stats.lists} {t('gallery.lists')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <ListTodo className="h-4 w-4" />
                <span>
                  {template.stats.tasks} {t('gallery.tasks')}
                </span>
              </div>
              {template.stats.labels > 0 && (
                <div className="flex items-center gap-1">
                  <Tags className="h-4 w-4" />
                  <span>
                    {template.stats.labels} {t('gallery.labels')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {template.isOwner && (
            <>
              {template.visibility === 'private' && (
                <Button
                  variant="outline"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  {t('share.manage')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('detail.edit')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-dynamic-red/80 hover:bg-dynamic-red/10 hover:text-dynamic-red"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('detail.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-dynamic-red" />
                      {t('detail.delete_confirm_title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('detail.delete_confirm_description', {
                        name: template.name,
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      {t('common.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
                    >
                      {isDeleting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('detail.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <Button onClick={() => setUseDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('detail.use_template')}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Template Preview */}
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">{t('detail.preview_title')}</h2>

        {/* Lists Preview */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {template.content.lists.map((list, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <KanbanSquare className="h-4 w-4 text-muted-foreground" />
                  {list.name}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-xs">
                    {list.status}
                  </Badge>
                  <span>{list.tasks.length} tasks</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-48 space-y-1.5 overflow-y-auto pt-0">
                {list.tasks.length === 0 ? (
                  <p className="py-2 text-center text-muted-foreground text-xs">
                    {t('detail.no_tasks')}
                  </p>
                ) : (
                  list.tasks.slice(0, 5).map((task, taskIndex) => (
                    <div
                      key={taskIndex}
                      className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-sm"
                    >
                      <div
                        className={cn(
                          'h-3 w-3 shrink-0 rounded-sm border',
                          task.completed && 'border-primary bg-primary'
                        )}
                      >
                        {task.completed && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <span
                        className={cn(
                          'truncate text-xs',
                          task.completed && 'text-muted-foreground line-through'
                        )}
                      >
                        {task.name}
                      </span>
                    </div>
                  ))
                )}
                {list.tasks.length > 5 && (
                  <p className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                    <ChevronRight className="h-3 w-3" />
                    {t('detail.more_tasks', { count: list.tasks.length - 5 })}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Labels Preview */}
        {template.content.labels.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-sm">{t('detail.labels_title')}</h3>
            <div className="flex flex-wrap gap-2">
              {template.content.labels.map((label, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="flex items-center gap-1.5"
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              {t('detail.edit_title')}
            </DialogTitle>
            <DialogDescription>
              {t('detail.edit_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={nameId}>{t('save_dialog.name_label')}</Label>
              <Input
                id={nameId}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('save_dialog.name_placeholder')}
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={descId}>
                {t('save_dialog.description_label')}
              </Label>
              <Textarea
                id={descId}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t('save_dialog.description_placeholder')}
                rows={2}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={visibilityId}>
                {t('save_dialog.visibility_label')}
              </Label>
              <Select
                value={editVisibility}
                onValueChange={(v) =>
                  setEditVisibility(v as 'private' | 'workspace' | 'public')
                }
              >
                <SelectTrigger id={visibilityId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    {t('visibility.private')}
                  </SelectItem>
                  <SelectItem value="workspace">
                    {t('visibility.workspace')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {editVisibility === 'private'
                  ? t('visibility.private_hint')
                  : t('visibility.workspace_hint')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isEditing}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isEditing || !editName.trim()}
            >
              {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save_changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Use Template Dialog */}
      <Dialog open={useDialogOpen} onOpenChange={setUseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t('detail.use_dialog_title')}
            </DialogTitle>
            <DialogDescription>
              {t('detail.use_dialog_description', { name: template.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={boardNameId}>
                {t('detail.board_name_label')}
              </Label>
              <Input
                id={boardNameId}
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder={t('detail.board_name_placeholder')}
                maxLength={255}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleUseTemplate();
                  }
                }}
              />
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="mb-2 font-medium">
                {t('detail.will_create_label')}
              </p>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li className="flex items-center gap-2">
                  <KanbanSquare className="h-3.5 w-3.5" />
                  {template.stats.lists} {t('gallery.lists')}
                </li>
                <li className="flex items-center gap-2">
                  <ListTodo className="h-3.5 w-3.5" />
                  {template.stats.tasks} {t('gallery.tasks')}
                </li>
                {template.stats.labels > 0 && (
                  <li className="flex items-center gap-2">
                    <Tags className="h-3.5 w-3.5" />
                    {template.stats.labels} {t('gallery.labels')}
                  </li>
                )}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUseDialogOpen(false)}
              disabled={isUsing}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleUseTemplate}
              disabled={isUsing || !newBoardName.trim()}
            >
              {isUsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('detail.create_board')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Management Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              {t('share.dialog_title')}
            </DialogTitle>
            <DialogDescription>
              {t('share.dialog_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add new share */}
            <div className="space-y-2">
              <Label htmlFor={shareEmailId}>{t('share.email_label')}</Label>
              <div className="flex gap-2">
                <Input
                  id={shareEmailId}
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder={t('share.email_placeholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddShare();
                    }
                  }}
                  disabled={isAddingShare}
                />
                <Button
                  onClick={handleAddShare}
                  disabled={isAddingShare || !shareEmail.trim()}
                >
                  {isAddingShare ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {t('share.email_hint')}
              </p>
            </div>

            <Separator />

            {/* Existing shares */}
            <div className="space-y-2">
              <Label>{t('share.shared_with')}</Label>
              {isLoadingShares ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : shares.length === 0 ? (
                <div className="rounded-md bg-muted/50 py-6 text-center">
                  <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm">
                    {t('share.no_shares')}
                  </p>
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center justify-between rounded-md bg-muted/50 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <Mail className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm">
                            {share.email || share.user_id}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {t('share.view_access')}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveShare(share.id)}
                        disabled={isDeletingShare === share.id}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-dynamic-red"
                      >
                        {isDeletingShare === share.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  Pencil,
  Plus,
  Share2,
  Tags,
  Trash2,
  Users,
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
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BoardTemplateWithContent } from '../types';
import { EditTemplateDialog } from './edit-template-dialog';
import { ShareTemplateDialog } from './share-template-dialog';
import { UseTemplateDialog } from './use-template-dialog';

interface Props {
  wsId: string;
  template: BoardTemplateWithContent;
}

export default function TemplateDetailClient({ wsId, template }: Props) {
  const t = useTranslations('ws-board-templates');
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

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
              <Button
                variant="outline"
                onClick={() => setShareDialogOpen(true)}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {t('share.manage')}
              </Button>
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

      <EditTemplateDialog
        wsId={wsId}
        templateId={template.id}
        templateName={template.name}
        templateDescription={template.description}
        templateVisibility={template.visibility}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <ShareTemplateDialog
        wsId={wsId}
        templateId={template.id}
        isOwner={template.isOwner}
        visibility={template.visibility}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />

      <UseTemplateDialog
        wsId={wsId}
        templateId={template.id}
        templateName={template.name}
        templateStats={template.stats}
        open={useDialogOpen}
        onOpenChange={setUseDialogOpen}
      />
    </div>
  );
}

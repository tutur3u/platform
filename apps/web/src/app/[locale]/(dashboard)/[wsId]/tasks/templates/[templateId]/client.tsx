'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  Bookmark,
  Calendar,
  Check,
  Circle,
  Clock,
  Flag,
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
  Zap,
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
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BoardTemplateWithContent, TemplateTask } from '../types';
import { EditTemplateDialog } from './edit-template-dialog';
import { ShareTemplateDialog } from './share-template-dialog';
import { UseTemplateDialog } from './use-template-dialog';

interface Props {
  wsId: string;
  template: BoardTemplateWithContent;
}

// Priority configuration with icons and colors
const priorityConfig = {
  critical: {
    label: 'Critical',
    icon: Zap,
    color: 'text-dynamic-red',
    bgColor: 'bg-dynamic-red/10',
    borderColor: 'border-dynamic-red/30',
  },
  high: {
    label: 'High',
    icon: ArrowUp,
    color: 'text-dynamic-orange',
    bgColor: 'bg-dynamic-orange/10',
    borderColor: 'border-dynamic-orange/30',
  },
  normal: {
    label: 'Normal',
    icon: Circle,
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
    borderColor: 'border-dynamic-blue/30',
  },
  low: {
    label: 'Low',
    icon: AlertCircle,
    color: 'text-dynamic-green',
    bgColor: 'bg-dynamic-green/10',
    borderColor: 'border-dynamic-green/30',
  },
} as const;

// Status color mapping
const statusColors = {
  todo: 'bg-dynamic-slate/10 border-dynamic-slate/30',
  'in-progress': 'bg-dynamic-blue/10 border-dynamic-blue/30',
  'in progress': 'bg-dynamic-blue/10 border-dynamic-blue/30',
  done: 'bg-dynamic-green/10 border-dynamic-green/30',
  completed: 'bg-dynamic-green/10 border-dynamic-green/30',
  blocked: 'bg-dynamic-red/10 border-dynamic-red/30',
  review: 'bg-dynamic-purple/10 border-dynamic-purple/30',
  backlog: 'bg-dynamic-gray/10 border-dynamic-gray/30',
} as const;

// Helper to get status color
const getStatusColor = (status: string): string => {
  const normalizedStatus = status.toLowerCase().replace(/\s+/g, '-');
  return (
    statusColors[normalizedStatus as keyof typeof statusColors] ||
    'bg-dynamic-gray/10 border-dynamic-gray/30'
  );
};

// Task card component
function TaskPreviewCard({ task }: { task: TemplateTask }) {
  const priority = task.priority || 'normal';
  const config = priorityConfig[priority];
  const PriorityIcon = config.icon;

  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-background p-3 transition-all hover:shadow-md',
        task.completed && 'opacity-60'
      )}
    >
      {/* Priority indicator bar */}
      <div
        className={cn(
          'absolute top-0 left-0 h-full w-1 rounded-l-lg',
          config.bgColor.replace('/10', '')
        )}
      />

      <div className="ml-2 space-y-2">
        {/* Task header */}
        <div className="flex items-start gap-2">
          <div
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded border-2 transition-colors',
              task.completed
                ? 'border-dynamic-green bg-dynamic-green'
                : 'border-border'
            )}
          >
            {task.completed && (
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            )}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={cn(
                  'font-medium text-sm leading-tight',
                  task.completed && 'text-muted-foreground line-through'
                )}
              >
                {task.name}
              </p>

              {/* Priority badge */}
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 gap-1 border px-1.5 py-0',
                  config.borderColor,
                  config.color
                )}
              >
                <PriorityIcon className="h-3 w-3" />
                <span className="text-[10px]">{config.label}</span>
              </Badge>
            </div>

            {/* Date information */}
            {(task.start_date || task.end_date) && (
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                {task.start_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {format(new Date(task.start_date), 'MMM dd, yyyy')}
                    </span>
                  </div>
                )}
                {task.start_date && task.end_date && (
                  <span className="text-muted-foreground/50">→</span>
                )}
                {task.end_date && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>
                      {format(new Date(task.end_date), 'MMM dd, yyyy')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{t('detail.preview_title')}</h2>
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            <div className="flex items-center gap-1.5">
              <KanbanSquare className="h-4 w-4" />
              <span className="font-medium">
                {template.content.lists.length}
              </span>
              <span>{t('gallery.lists')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ListTodo className="h-4 w-4" />
              <span className="font-medium">
                {template.content.lists.reduce(
                  (sum, list) => sum + list.tasks.length,
                  0
                )}
              </span>
              <span>{t('gallery.tasks')}</span>
            </div>
          </div>
        </div>

        {/* Lists Preview - Enhanced Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {template.content.lists.map((list, index) => {
            const completedTasks = list.tasks.filter((t) => t.completed).length;
            const totalTasks = list.tasks.length;

            return (
              <Card
                key={index}
                className={cn(
                  'overflow-hidden border-l-4 transition-all hover:shadow-lg',
                  getStatusColor(list.status)
                )}
              >
                <CardHeader className="space-y-3 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <KanbanSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2">{list.name}</span>
                    </CardTitle>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status badge */}
                    <Badge
                      variant="secondary"
                      className="font-medium text-xs capitalize"
                    >
                      {list.status}
                    </Badge>

                    {/* Task count */}
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <ListTodo className="h-3.5 w-3.5" />
                      <span>
                        {completedTasks} / {totalTasks} tasks
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 pt-0">
                  {list.tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/30 py-8 text-center">
                      <ListTodo className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-sm">
                        {t('detail.no_tasks')}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-100 space-y-2 overflow-y-auto pr-1">
                      {list.tasks.map((task, taskIndex) => (
                        <TaskPreviewCard key={taskIndex} task={task} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Labels Preview - Enhanced */}
        {template.content.labels.length > 0 && (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-6">
            <div className="flex items-center gap-2">
              <Tags className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-base">
                {t('detail.labels_title')}
              </h3>
              <Badge variant="secondary" className="ml-auto text-xs">
                {template.content.labels.length} labels
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              {template.content.labels.map((label, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="gap-2 border-2 px-3 py-1.5 text-sm transition-all hover:scale-105"
                  style={{
                    borderColor: `${label.color}40`,
                    backgroundColor: `${label.color}10`,
                  }}
                >
                  <div
                    className="h-3 w-3 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="font-medium">{label.name}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Template Settings Info */}
        {template.content.settings &&
          (template.content.settings.estimation_type ||
            template.content.settings.allow_zero_estimates !== undefined ||
            template.content.settings.extended_estimation !== undefined) && (
            <div className="rounded-lg border bg-muted/30 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Flag className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-base">Board Settings</h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {template.content.settings.estimation_type && (
                  <div className="flex items-start gap-3 rounded-md border bg-background p-3">
                    <div className="rounded-lg bg-dynamic-blue/10 p-2">
                      <Flag className="h-4 w-4 text-dynamic-blue" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Estimation Type</p>
                      <p className="text-muted-foreground text-xs capitalize">
                        {template.content.settings.estimation_type}
                      </p>
                    </div>
                  </div>
                )}

                {template.content.settings.allow_zero_estimates !==
                  undefined && (
                  <div className="flex items-start gap-3 rounded-md border bg-background p-3">
                    <div className="rounded-lg bg-dynamic-purple/10 p-2">
                      <Circle className="h-4 w-4 text-dynamic-purple" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Zero Estimates</p>
                      <p className="text-muted-foreground text-xs">
                        {template.content.settings.allow_zero_estimates
                          ? 'Allowed'
                          : 'Not allowed'}
                      </p>
                    </div>
                  </div>
                )}

                {template.content.settings.extended_estimation !==
                  undefined && (
                  <div className="flex items-start gap-3 rounded-md border bg-background p-3">
                    <div className="rounded-lg bg-dynamic-green/10 p-2">
                      <Zap className="h-4 w-4 text-dynamic-green" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Extended Estimation</p>
                      <p className="text-muted-foreground text-xs">
                        {template.content.settings.extended_estimation
                          ? 'Enabled'
                          : 'Disabled'}
                      </p>
                    </div>
                  </div>
                )}
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

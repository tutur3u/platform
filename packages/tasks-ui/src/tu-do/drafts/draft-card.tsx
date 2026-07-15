'use client';

import {
  Calendar,
  Flag,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Play,
  Tags,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { useTranslations } from 'next-intl';

export interface TaskDraft {
  id: string;
  ws_id: string;
  creator_id: string;
  board_id: string | null;
  list_id: string | null;
  name: string;
  description: string | null;
  priority: string | null;
  start_date: string | null;
  end_date: string | null;
  estimation_points: number | null;
  label_ids: string[];
  assignee_ids: string[];
  project_ids: string[];
  created_at: string;
  updated_at: string;
}

interface DraftCardProps {
  draft: TaskDraft;
  onConvert: (draft: TaskDraft) => void;
  onEdit: (draft: TaskDraft) => void;
  onClick?: (draft: TaskDraft) => void;
  onDelete: (draftId: string) => void;
  isDeleting?: boolean;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  critical: {
    label: 'Urgent',
    className: 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red',
  },
  high: {
    label: 'High',
    className:
      'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
  },
  normal: {
    label: 'Medium',
    className:
      'border-dynamic-yellow/40 bg-dynamic-yellow/10 text-dynamic-yellow',
  },
  low: {
    label: 'Low',
    className: 'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue',
  },
};

export function DraftCard({
  draft,
  onConvert,
  onEdit,
  onClick,
  onDelete,
  isDeleting,
}: DraftCardProps) {
  const t = useTranslations('task-drafts');
  const priority = draft.priority ? priorityConfig[draft.priority] : null;

  const formattedDate = new Date(draft.created_at).toLocaleDateString(
    undefined,
    { month: 'short', day: 'numeric', year: 'numeric' }
  );

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 hover:shadow-md',
        isDeleting && 'pointer-events-none opacity-50'
      )}
      onClick={() => onClick?.(draft)}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-semibold text-sm leading-tight">{draft.name}</h3>
          {draft.description && (
            <p className="line-clamp-2 text-muted-foreground text-xs">
              {getDescriptionText(draft.description)}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onConvert(draft)}>
              <Play className="mr-2 h-4 w-4" />
              {t('convert_to_task')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(draft)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('edit_draft')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(draft.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('delete_draft')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        <div className="flex flex-wrap items-center gap-2">
          {priority && (
            <Badge
              variant="outline"
              className={cn('text-xs', priority.className)}
            >
              <Flag className="mr-1 h-3 w-3" />
              {priority.label}
            </Badge>
          )}

          {draft.assignee_ids.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Users className="mr-1 h-3 w-3" />
              {draft.assignee_ids.length}
            </Badge>
          )}

          {draft.label_ids.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Tags className="mr-1 h-3 w-3" />
              {draft.label_ids.length}
            </Badge>
          )}

          {draft.project_ids.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              <FolderKanban className="mr-1 h-3 w-3" />
              {draft.project_ids.length}
            </Badge>
          )}

          {draft.end_date && (
            <Badge variant="secondary" className="text-xs">
              <Calendar className="mr-1 h-3 w-3" />
              {new Date(draft.end_date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground text-xs">{formattedDate}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onConvert(draft);
            }}
          >
            <Play className="mr-1 h-3 w-3" />
            {t('convert_to_task')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

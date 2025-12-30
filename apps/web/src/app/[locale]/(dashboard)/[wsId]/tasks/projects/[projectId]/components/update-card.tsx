'use client';

import {
  Edit2,
  Loader2,
  MoreVertical,
  Trash2,
  Check,
  X,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useTranslations, useFormatter } from 'next-intl';
import type { UpdateCardProps } from '../types';

export function UpdateCard({
  update,
  currentUserId,
  isEditing,
  isDeleting,
  editingContent,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onContentChange,
  fadeInVariant,
}: UpdateCardProps) {
  const t = useTranslations('task_project_detail.update_card');
  const isOwnUpdate = update.creator_id === currentUserId;
  const { dateTime } = useFormatter();

  return (
    <motion.div {...fadeInVariant}>
      <Card className="group relative border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-6 transition-all hover:border-dynamic-blue/30 hover:shadow-lg">
        <div className="mb-3 flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={update.creator?.avatar_url || undefined} />
            <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple text-white">
              {update.creator?.display_name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {update.creator?.display_name || t('unknown_user')}
                </span>
                <span className="text-muted-foreground text-xs">
                  {dateTime(new Date(update.created_at), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {update.updated_at !== update.created_at && (
                  <Badge variant="outline" className="text-xs">
                    {t('edited_badge')}
                  </Badge>
                )}
              </div>

              {isOwnUpdate && !isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                      disabled={isDeleting}
                      aria-label={t('actions_aria')}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onEdit} className="gap-2">
                      <Edit2 className="h-4 w-4" />
                      {t('edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="gap-2 text-dynamic-red"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editingContent}
                  onChange={(e) => onContentChange(e.target.value)}
                  className="min-h-25 resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={onSave}
                    className="bg-linear-to-r from-dynamic-blue to-dynamic-purple"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {t('save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onCancel}
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80">
                {update.content}
              </div>
            )}
          </div>
        </div>

        {!isEditing &&
          update.reactionGroups &&
          update.reactionGroups.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
              {update.reactionGroups.map((group, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="cursor-pointer border-dynamic-pink/30 bg-dynamic-pink/10 transition-all hover:border-dynamic-pink/50"
                >
                  {group.emoji} {group.count}
                </Badge>
              ))}
            </div>
          )}

        {isDeleting && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-dynamic-red" />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

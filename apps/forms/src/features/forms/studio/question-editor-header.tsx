'use client';

import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  MoreHorizontal,
  Trash,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { CollapsibleTrigger } from '@tuturuuu/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import type { Dispatch, SetStateAction } from 'react';

import { QuestionTypeIcon } from '../form-icons';
import { FormsMarkdown } from '../forms-markdown';
import type { FormQuestionInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import { DestructiveActionDialog } from './destructive-action-dialog';
import type { FormsTranslator } from './studio-translator';

export function renderQuestionEditorHeader({
  t,
  setActivatorNodeRef,
  attributes,
  listeners,
  toneClasses,
  questionIndex,
  isSectionBreak,
  questionType,
  studioTitleClassName,
  questionTitle,
  required,
  open,
  actionsOpen,
  setActionsOpen,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  deleteDialogOpen,
  setDeleteDialogOpen,
}: {
  t: FormsTranslator;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  attributes: any;
  listeners: any;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  questionIndex: number;
  isSectionBreak: boolean;
  questionType: FormQuestionInput['type'];
  studioTitleClassName: string;
  questionTitle: string | undefined;
  required: boolean | undefined;
  open: boolean;
  actionsOpen: boolean;
  setActionsOpen: Dispatch<SetStateAction<boolean>>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="flex items-start gap-2 px-4 py-3">
      <Button
        ref={setActivatorNodeRef}
        type="button"
        size="icon"
        variant="ghost"
        className="mt-0.5 shrink-0 cursor-grab rounded-xl text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={t('studio.reorder_questions')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto flex-1 justify-start whitespace-normal px-0 hover:bg-transparent"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border font-semibold text-xs',
                toneClasses.selectedOptionClassName
              )}
            >
              {questionIndex + 1}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {isSectionBreak ? (
                <div className="flex min-h-9 items-center">
                  <Separator className="bg-border/60" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground">
                      <QuestionTypeIcon
                        type={questionType}
                        className="h-3.5 w-3.5"
                      />
                    </span>
                    <div
                      className={cn(
                        'min-w-0 flex-1 truncate text-left',
                        studioTitleClassName
                      )}
                    >
                      <FormsMarkdown
                        content={
                          questionTitle ||
                          t('studio.question_number', {
                            count: questionIndex + 1,
                          })
                        }
                        variant="inline"
                        className="truncate"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-full px-2 py-0.5 text-[11px]"
                    >
                      {t(`question_type.${questionType}`)}
                    </Badge>
                    {required ? (
                      <Badge
                        variant="outline"
                        className="rounded-full px-2 py-0.5 text-[11px]"
                      >
                        {t('runtime.required')}
                      </Badge>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </Button>
      </CollapsibleTrigger>
      <div className="flex items-center gap-1">
        <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="rounded-xl"
              aria-label={t('studio.more')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() => {
                onMoveUp();
                setActionsOpen(false);
              }}
            >
              <ChevronUp className="h-4 w-4" />
              {t('studio.move_question_up' as any)}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onMoveDown();
                setActionsOpen(false);
              }}
            >
              <ChevronDown className="h-4 w-4" />
              {t('studio.move_question_down' as any)}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onDuplicate();
                setActionsOpen(false);
              }}
            >
              <Copy className="h-4 w-4" />
              {t('studio.duplicate_question')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setActionsOpen(false);
                requestAnimationFrame(() => {
                  setDeleteDialogOpen(true);
                });
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash className="h-4 w-4" />
              {t('studio.delete_question')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DestructiveActionDialog
          actionLabel={t('studio.delete_question')}
          cancelLabel={t('studio.keep_question')}
          description={t('studio.delete_question_confirmation')}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={onRemove}
          title={t('studio.delete_question_title')}
        />
      </div>
    </div>
  );
}

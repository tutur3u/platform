'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  FileText,
  GripVertical,
  MessageSquare,
  MoreHorizontal,
  Trash,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardHeader } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useFieldArray, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FieldLabel } from '../form-icons';
import { FormsMarkdown } from '../forms-markdown';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
import type { getFormToneClasses } from '../theme';
import {
  getBodyTypographyClassName,
  getStudioTitleTypographyClassName,
} from '../typography';
import { createQuestionInput } from './block-catalog';
import { BlockInserter } from './block-inserter';
import { DestructiveActionDialog } from './destructive-action-dialog';
import { FormMediaField } from './form-media-field';
import { QuestionEditor } from './question-editor';
import { duplicateQuestionInput, type StudioForm } from './studio-utils';

export function SectionEditor({
  index,
  wsId,
  sectionId,
  form,
  open,
  onOpenChange,
  activeQuestionId,
  onActiveQuestionChange,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
  toneClasses,
}: {
  index: number;
  wsId: string;
  sectionId?: string;
  form: StudioForm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeQuestionId?: string;
  onActiveQuestionChange: (questionId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const questionSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  const questionsArray = useFieldArray({
    control: form.control,
    name: `sections.${index}.questions`,
  });
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionId ?? `section-${index}`,
  });
  const sectionTitle = useWatch({
    control: form.control,
    name: `sections.${index}.title`,
  });
  const sectionDescription = useWatch({
    control: form.control,
    name: `sections.${index}.description`,
  });
  const sectionImage = useWatch({
    control: form.control,
    name: `sections.${index}.image`,
  });
  const watchedQuestions = useWatch({
    control: form.control,
    name: `sections.${index}.questions`,
  });
  const typography = useWatch({
    control: form.control,
    name: 'theme.typography',
  });
  const studioTitleClassName = getStudioTitleTypographyClassName(
    typography?.headingSize ?? 'md'
  );
  const bodyClassName = getBodyTypographyClassName(
    typography?.bodySize ?? 'md'
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const addQuestion = (type: Parameters<typeof createQuestionInput>[0]) => {
    const nextQuestion = createQuestionInput(type, t);

    questionsArray.append(nextQuestion);
    onActiveQuestionChange(nextQuestion.id);
  };

  const insertQuestionAt = (
    questionIndex: number,
    type: Parameters<typeof createQuestionInput>[0]
  ) => {
    const nextQuestion = createQuestionInput(type, t);

    questionsArray.insert(questionIndex, nextQuestion);
    onActiveQuestionChange(nextQuestion.id);
  };

  const handleQuestionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = questionsArray.fields.findIndex(
      (_field, questionIndex) =>
        (watchedQuestions?.[questionIndex]?.id ??
          questionsArray.fields[questionIndex]?.id) === active.id
    );
    const newIndex = questionsArray.fields.findIndex(
      (_field, questionIndex) =>
        (watchedQuestions?.[questionIndex]?.id ??
          questionsArray.fields[questionIndex]?.id) === over.id
    );

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }

    questionsArray.move(oldIndex, newIndex);
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card
        ref={setNodeRef}
        style={style}
        className={cn(
          'overflow-hidden rounded-[1.75rem] border-border/70 bg-card/85 shadow-sm transition-shadow',
          isDragging && 'z-10 opacity-70 shadow-lg'
        )}
      >
        <div
          id={sectionId ? `form-section-${sectionId}` : undefined}
          className="scroll-mt-40"
        />
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <Button
              ref={setActivatorNodeRef}
              type="button"
              size="icon"
              variant="ghost"
              className="mt-0.5 shrink-0 cursor-grab rounded-xl text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label={t('studio.reorder_sections')}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto flex-1 justify-start px-0 hover:bg-transparent"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4 text-left">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border font-semibold text-sm',
                      toneClasses.selectedOptionClassName
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground">
                          <ClipboardList className="h-4 w-4" />
                        </span>
                        <div className={cn('truncate', studioTitleClassName)}>
                          <FormsMarkdown
                            content={
                              sectionTitle || t('studio.untitled_section')
                            }
                            variant="inline"
                            className="truncate"
                          />
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full px-2 py-0.5 text-[11px]"
                      >
                        {t('studio.question_count', {
                          count: questionsArray.fields.length,
                        })}
                      </Badge>
                    </div>
                    <div
                      className={cn(
                        'line-clamp-2 text-muted-foreground',
                        bodyClassName
                      )}
                    >
                      <FormsMarkdown
                        content={
                          sectionDescription?.trim() ||
                          t('studio.section_description_hint')
                        }
                        variant="inline"
                        className="line-clamp-2"
                      />
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    open && 'rotate-180'
                  )}
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
                    {t('studio.move_section_up')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onMoveDown();
                      setActionsOpen(false);
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                    {t('studio.move_section_down')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onDuplicate();
                      setActionsOpen(false);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    {t('studio.duplicate_section')}
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
                    {t('studio.delete_section')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <DestructiveActionDialog
          actionLabel={t('studio.delete_section')}
          cancelLabel={t('studio.keep_section')}
          description={t('studio.delete_section_confirmation')}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={onRemove}
          title={t('studio.delete_section_title')}
        />
        <CollapsibleContent className="overflow-hidden border-border/60 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="space-y-5 px-5 py-4">
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label>
                  <FieldLabel icon={FileText}>
                    {t('studio.section_title')}
                  </FieldLabel>
                </Label>
                <FormsRichTextEditor
                  value={sectionTitle || ''}
                  onChange={(nextValue) =>
                    form.setValue(`sections.${index}.title`, nextValue, {
                      shouldDirty: true,
                    })
                  }
                  toneClasses={toneClasses}
                  compact
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  <FieldLabel icon={MessageSquare}>
                    {t('studio.section_description')}
                  </FieldLabel>
                </Label>
                <FormsRichTextEditor
                  value={sectionDescription || ''}
                  onChange={(nextValue) =>
                    form.setValue(`sections.${index}.description`, nextValue, {
                      shouldDirty: true,
                    })
                  }
                  placeholder={t('studio.section_description_hint')}
                  toneClasses={toneClasses}
                />
              </div>
              <div>
                <FormMediaField
                  wsId={wsId}
                  scope="section"
                  value={
                    sectionImage ?? {
                      storagePath: '',
                      url: '',
                      alt: '',
                    }
                  }
                  onChange={(value) =>
                    form.setValue(`sections.${index}.image`, value, {
                      shouldDirty: true,
                    })
                  }
                  toneClasses={toneClasses}
                  label={t('studio.section_image')}
                  hint={t('studio.section_image_hint')}
                />
              </div>
            </div>

            <div className="space-y-3">
              <DndContext
                sensors={questionSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleQuestionDragEnd}
              >
                <SortableContext
                  items={questionsArray.fields.map(
                    (field, questionIndex) =>
                      watchedQuestions?.[questionIndex]?.id ?? field.id
                  )}
                  strategy={verticalListSortingStrategy}
                >
                  {questionsArray.fields.map((field, questionIndex) => {
                    const questionFormId =
                      watchedQuestions?.[questionIndex]?.id ?? field.id;

                    return (
                      <div key={field.id} className="space-y-3">
                        <QuestionEditor
                          wsId={wsId}
                          questionId={questionFormId}
                          sectionIndex={index}
                          questionIndex={questionIndex}
                          form={form}
                          open={activeQuestionId === questionFormId}
                          onOpenChange={(nextOpen) =>
                            onActiveQuestionChange(
                              nextOpen ? questionFormId : ''
                            )
                          }
                          toneClasses={toneClasses}
                          onMoveUp={() =>
                            questionIndex > 0 &&
                            questionsArray.move(
                              questionIndex,
                              questionIndex - 1
                            )
                          }
                          onMoveDown={() =>
                            questionIndex < questionsArray.fields.length - 1 &&
                            questionsArray.move(
                              questionIndex,
                              questionIndex + 1
                            )
                          }
                          onDuplicate={() => {
                            const question = form.getValues(
                              `sections.${index}.questions.${questionIndex}`
                            );

                            if (!question) {
                              return;
                            }

                            const nextQuestion =
                              duplicateQuestionInput(question);

                            questionsArray.insert(
                              questionIndex + 1,
                              nextQuestion
                            );
                            onActiveQuestionChange(nextQuestion.id);
                          }}
                          onRemove={() => {
                            questionsArray.remove(questionIndex);
                            if (activeQuestionId === questionFormId) {
                              onActiveQuestionChange('');
                            }
                          }}
                        />
                        <div className="flex justify-center">
                          <BlockInserter
                            compact
                            toneClasses={toneClasses}
                            onSelect={(type) =>
                              insertQuestionAt(questionIndex + 1, type)
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>

              <BlockInserter toneClasses={toneClasses} onSelect={addQuestion} />
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

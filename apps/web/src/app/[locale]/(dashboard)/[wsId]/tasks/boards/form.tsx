'use client';

import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { TagSuggestions, TagsInput } from '@tuturuuu/ui/board-tags-input';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Crown, FileText, TrendingUp, Users } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React from 'react';
import * as z from 'zod';
import {
  useCreateBoardWithTemplate,
  useStatusTemplates,
} from '@/lib/task-helper';

interface Props {
  wsId: string;
  data?: TaskBoard;
  children?: React.ReactNode;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .min(1, 'Board name is required')
    .refine((val) => val.trim().length > 0, 'Board name cannot be empty'),
  template_id: z.string().optional(),
  tags: z.array(z.string()).max(8, 'Maximum 8 tags allowed').optional(),
});

const templateIcons = {
  'Basic Kanban': Crown,
  'Software Development': Users,
  'Content Creation': FileText,
  'Sales Pipeline': TrendingUp,
};

// Dynamic color mappings for template previews
const colorClasses: Record<SupportedColor, string> = {
  GRAY: 'bg-dynamic-gray/30 border-dynamic-gray/50',
  RED: 'bg-dynamic-red/30 border-dynamic-red/50',
  BLUE: 'bg-dynamic-blue/30 border-dynamic-blue/50',
  GREEN: 'bg-dynamic-green/30 border-dynamic-green/50',
  YELLOW: 'bg-dynamic-yellow/30 border-dynamic-yellow/50',
  ORANGE: 'bg-dynamic-orange/30 border-dynamic-orange/50',
  PURPLE: 'bg-dynamic-purple/30 border-dynamic-purple/50',
  PINK: 'bg-dynamic-pink/30 border-dynamic-pink/50',
  INDIGO: 'bg-dynamic-indigo/30 border-dynamic-indigo/50',
  CYAN: 'bg-dynamic-cyan/30 border-dynamic-cyan/50',
};

// Common tag suggestions for task boards
const TAG_SUGGESTIONS = [
  'Development',
  'Design',
  'Marketing',
  'Sales',
  'Research',
  'Planning',
  'Testing',
  'Documentation',
  'Bug Fixes',
  'Feature',
  'Urgent',
  'Personal',
  'Work',
  'Project',
  'Team',
  'Client',
];

// Utility function for error handling
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unexpected error occurred';
};

export function TaskBoardForm({ wsId, data, children, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const {
    data: templates,
    isLoading: templatesLoading,
    error: templatesError,
  } = useStatusTemplates();
  const createBoardMutation = useCreateBoardWithTemplate(wsId);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      template_id: '',
      tags: data?.tags || [],
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting =
    form.formState.isSubmitting || createBoardMutation.isPending;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    try {
      if (formData.id) {
        // Update existing board (legacy API call)
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/task-boards/${formData.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: formData.name.trim(),
              tags: formData.tags || [],
            }),
          }
        );

        if (res.ok) {
          toast({
            title: 'Success',
            description: 'Task board updated successfully',
          });
          onFinish?.(formData);
          setOpen(false);
          router.refresh();
        } else {
          const errorData = await res
            .json()
            .catch(() => ({ message: 'Unknown error occurred' }));
          toast({
            title: 'Failed to edit task board',
            description: errorData.message || 'An unexpected error occurred',
            variant: 'destructive',
          });
        }
      } else {
        // Create new board with template
        await createBoardMutation.mutateAsync({
          name: formData.name.trim(),
          templateId: formData.template_id || undefined,
          tags: formData.tags || [],
        });

        toast({
          title: 'Success',
          description: 'Task board created successfully',
        });

        onFinish?.(formData);
        setOpen(false);
        router.refresh();
        form.reset();
      }
    } catch (error) {
      console.error('Error submitting form:', error);

      toast({
        title: `Failed to ${formData.id ? 'edit' : 'create'} task board`,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const selectedTemplate = templates?.find(
    (t) => t.id === form.watch('template_id')
  );

  const isEditMode = !!data?.id;

  const formContent = (
    <div className="flex h-full max-h-[min(85vh,800px)] w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background px-4 py-4 sm:px-6 sm:py-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold sm:text-xl">
            {isEditMode ? 'Edit Task Board' : 'Create New Task Board'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {isEditMode
              ? 'Update your task board name'
              : 'Choose a template and create your project board'}
          </p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="px-4 py-4 sm:px-6 sm:py-6">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                {/* Board Name Input */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium sm:text-base">
                        {t('ws-task-boards.name')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter board name..."
                          autoComplete="off"
                          className="text-sm sm:text-base"
                          autoFocus
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tags Input */}
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium sm:text-base">
                        Tags
                      </FormLabel>
                      <FormControl>
                        <TagsInput
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="Add tags to categorize your board..."
                          maxTags={8}
                          validateTag={(tag) => tag.length <= 20}
                          className="text-sm sm:text-base"
                        />
                      </FormControl>
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">
                          Suggestions:
                        </Label>
                        <div className="mt-1">
                          <TagSuggestions
                            suggestions={TAG_SUGGESTIONS}
                            selectedTags={field.value || []}
                            onTagSelect={(tag) =>
                              field.onChange([...(field.value || []), tag])
                            }
                            maxDisplay={6}
                          />
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Template Selection (only for new boards) */}
                {!isEditMode && (
                  <>
                    <Separator className="my-6" />

                    <div className="space-y-4 sm:space-y-6">
                      <div className="text-center">
                        <Label className="text-sm font-medium sm:text-base">
                          Choose a Workflow Template
                        </Label>
                        <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
                          Select a pre-configured template to get started
                          quickly, or create a blank board
                        </p>
                      </div>

                      {/* Error State */}
                      {templatesError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-950/30">
                          <p className="text-sm text-red-700 dark:text-red-300">
                            Failed to load templates. You can still create a
                            blank board.
                          </p>
                        </div>
                      )}

                      {templatesLoading ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-20 w-full sm:h-24" />
                          ))}
                        </div>
                      ) : (
                        <FormField
                          control={form.control}
                          name="template_id"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  className="grid grid-cols-1 gap-4 md:grid-cols-2"
                                >
                                  {/* Blank Template Option */}
                                  <div className="col-span-full">
                                    <Label
                                      htmlFor="blank"
                                      className={cn(
                                        'flex cursor-pointer items-start space-x-3 rounded-lg border-2 p-3 transition-all duration-200 sm:space-x-4 sm:p-4',
                                        field.value === '' || !field.value
                                          ? 'border-primary bg-primary/5 ring-2 ring-primary/10'
                                          : 'border-border hover:border-primary/30 hover:bg-muted/30'
                                      )}
                                    >
                                      <RadioGroupItem
                                        value=""
                                        id="blank"
                                        className="mt-0.5 sm:mt-1"
                                      />
                                      <Crown className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
                                      <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-sm font-medium sm:text-base">
                                            Blank Board
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            Custom
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground sm:text-sm">
                                          Start with a clean slate and create
                                          your own workflow
                                        </p>
                                        <div className="flex flex-wrap gap-1 sm:gap-2">
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            Basic setup
                                          </Badge>
                                        </div>
                                      </div>
                                    </Label>
                                  </div>

                                  {/* Template Options */}
                                  {templates?.map((template) => {
                                    const Icon =
                                      templateIcons[
                                        template.name as keyof typeof templateIcons
                                      ] || Crown;
                                    const isSelected =
                                      field.value === template.id;

                                    return (
                                      <div key={template.id} className="h-full">
                                        <Label
                                          htmlFor={template.id}
                                          className={cn(
                                            'flex h-full cursor-pointer items-start space-x-3 rounded-lg border-2 p-3 transition-all duration-200 sm:space-x-4 sm:p-4',
                                            isSelected
                                              ? 'border-primary bg-primary/5 ring-2 ring-primary/10'
                                              : 'border-border hover:border-primary/30 hover:bg-muted/30'
                                          )}
                                        >
                                          <RadioGroupItem
                                            value={template.id}
                                            id={template.id}
                                            className="mt-0.5 sm:mt-1"
                                          />
                                          <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
                                          <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-medium sm:text-base">
                                                {template.name}
                                              </span>
                                              {template.is_default && (
                                                <Badge
                                                  variant="secondary"
                                                  className="text-xs"
                                                >
                                                  Recommended
                                                </Badge>
                                              )}
                                            </div>
                                            {template.description && (
                                              <p className="text-xs text-muted-foreground sm:text-sm">
                                                {template.description}
                                              </p>
                                            )}
                                            <div className="flex flex-wrap gap-1 sm:gap-2">
                                              {template.statuses
                                                .slice(0, 4)
                                                .map((status) => (
                                                  <Badge
                                                    key={`${status.status}-${status.name}`}
                                                    variant="outline"
                                                    className="text-xs"
                                                  >
                                                    {status.name}
                                                  </Badge>
                                                ))}
                                              {template.statuses.length > 4 && (
                                                <Badge
                                                  variant="outline"
                                                  className="text-xs text-muted-foreground"
                                                >
                                                  +
                                                  {template.statuses.length - 4}{' '}
                                                  more
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        </Label>
                                      </div>
                                    );
                                  })}
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* Template Preview */}
                      {selectedTemplate && (
                        <div className="rounded-xl border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-muted/30 p-4 sm:p-6">
                          <div className="mb-3 flex items-center gap-2 sm:mb-4">
                            <span className="text-base sm:text-lg">✨</span>
                            <h4 className="text-sm font-medium sm:text-base">
                              Template Preview
                            </h4>
                          </div>
                          <p className="mb-3 text-xs text-muted-foreground sm:mb-4 sm:text-sm">
                            This template will create{' '}
                            <strong>{selectedTemplate.statuses.length}</strong>{' '}
                            lists to organize your workflow:
                          </p>
                          <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2">
                            {selectedTemplate.statuses.map((status, index) => {
                              const colorClass =
                                colorClasses[status.color] || colorClasses.GRAY;
                              return (
                                <div
                                  key={`${status.status}-${status.name}`}
                                  className={cn(
                                    'flex items-center gap-2 rounded-lg border p-2 text-xs backdrop-blur-sm transition-all duration-200 sm:gap-3 sm:p-3 sm:text-sm',
                                    colorClass,
                                    'hover:scale-[1.02]'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'h-2.5 w-2.5 flex-shrink-0 rounded-full border sm:h-3 sm:w-3',
                                      colorClass
                                    )}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="truncate font-medium">
                                      {status.name}
                                    </span>
                                    {status.status === 'closed' && (
                                      <Badge
                                        variant="secondary"
                                        className="ml-1 text-xs sm:ml-2"
                                      >
                                        Single List
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    #{index + 1}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </form>
            </Form>
          </div>
        </ScrollArea>
      </div>

      {/* Fixed Footer */}
      <div className="flex-shrink-0 border-t bg-background/95 p-4 backdrop-blur-sm sm:p-6">
        <Button
          type="submit"
          className="w-full"
          disabled={disabled}
          onClick={form.handleSubmit(onSubmit)}
          size="lg"
        >
          {isSubmitting && (
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
          )}
          {isEditMode ? t('common.edit') : t('common.create')}
        </Button>
        {!isEditMode && (
          <p className="mt-2 text-center text-xs text-muted-foreground sm:text-sm">
            You can customize lists and colors after creating the board
          </p>
        )}
      </div>
    </div>
  );

  // If children are provided, wrap in dialog
  if (children) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent
          className="p-0"
          style={{
            maxWidth: '1200px',
            width: '85vw',
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>
              {isEditMode ? 'Edit Task Board' : 'Create New Task Board'}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? 'Update your task board name'
                : 'Choose a template and create your project board'}
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    );
  }

  // Otherwise return form content directly
  return formContent;
}

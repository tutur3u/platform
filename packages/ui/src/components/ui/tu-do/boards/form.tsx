'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { useCreateBoardWithTemplate } from '@tuturuuu/utils/task-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React from 'react';
import * as z from 'zod';
import IconPicker, {
  WORKSPACE_BOARD_ICON_VALUES,
  type WorkspaceBoardIconKey,
} from '../../custom/icon-picker';

interface Props {
  wsId: string;
  data?: Partial<WorkspaceTaskBoard>;
  children?: React.ReactNode;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  showCancel?: boolean;
  onCancel?: () => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  icon: z.enum(WORKSPACE_BOARD_ICON_VALUES).nullable().optional(),
});

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unexpected error occurred';
};

export function TaskBoardForm({
  wsId,
  data,
  children,
  onFinish,
  showCancel,
  onCancel,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const createBoardMutation = useCreateBoardWithTemplate(wsId);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      // Prefer undefined for "no icon" (avoids null vs undefined TS mismatch)
      icon: data?.icon ?? undefined,
    },
  });

  const isDirty = form.formState.isDirty;
  const isSubmitting =
    form.formState.isSubmitting || createBoardMutation.isPending;

  const isEditMode = !!data?.id;

  // For new boards, only check if valid and not submitting
  // For editing, require the form to be dirty (changed)
  const disabled = isEditMode ? !isDirty || isSubmitting : isSubmitting;

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    try {
      // Use "Untitled Board" as default if name is empty or only whitespace
      const boardName = formData.name?.trim() || 'Untitled Board';
      const icon = (formData.icon ?? null) as WorkspaceBoardIconKey | null;

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
              name: boardName,
              icon,
            }),
          }
        );

        if (res.ok) {
          toast.success('Board updated');
          onFinish?.(formData);
          setOpen(false);
          router.refresh();
        } else {
          const errorData = await res
            .json()
            .catch(() => ({ message: 'Unknown error occurred' }));
          toast.error(errorData.message || 'Failed to update board');
        }
      } else {
        // Create new board (default lists are created by DB trigger)
        const newBoard = await createBoardMutation.mutateAsync({
          name: boardName,
          icon,
        });

        toast.success('Board created');

        // Pass the created board data (with id) to onFinish
        onFinish?.({ ...formData, id: newBoard.id });
        setOpen(false);
        // Ensure the boards list refreshes immediately (works for apps/tudo + ui views)
        queryClient.invalidateQueries({ queryKey: ['boards', wsId] });
        router.refresh();
        form.reset();
      }
    } catch (error) {
      console.error('Error submitting form:', error);

      toast.error(getErrorMessage(error));
    }
  };

  const formContent = (
    <div className="w-full space-y-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <Pencil className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Plus className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="font-semibold text-lg">
            {isEditMode ? t('common.edit') : t('ws-task-boards.create')}
          </h2>
        </div>
        <p className="text-muted-foreground text-sm">
          {isEditMode
            ? t('ws-task-boards.name')
            : t('ws-task-boards.description')}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex items-start gap-4">
            <FormField
              control={form.control}
              name="icon"
              render={() => (
                <FormItem className="w-fit shrink-0">
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('ws-task-boards.icon_label')}
                  </FormLabel>
                  <FormControl>
                    <IconPicker
                      value={form.watch('icon') ?? null}
                      onValueChange={(value) =>
                        form.setValue('icon', value, { shouldDirty: true })
                      }
                      title={t('ws-task-boards.icon_picker.title')}
                      description={t('ws-task-boards.icon_picker.description')}
                      searchPlaceholder={t(
                        'ws-task-boards.icon_picker.search_placeholder'
                      )}
                      clearLabel={t('ws-task-boards.icon_picker.clear')}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="min-w-0 flex-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('ws-task-boards.name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Untitled board"
                        autoComplete="off"
                        autoFocus
                        {...field}
                        className="h-10"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {(children || showCancel) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (children) setOpen(false);
                  else onCancel?.();
                }}
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
            )}
            <Button type="submit" disabled={disabled}>
              {isEditMode ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );

  // If children are provided, wrap in dialog
  if (children) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {isEditMode ? t('common.edit') : t('ws-task-boards.create')}
            </DialogTitle>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    );
  }

  // Otherwise return form content directly
  return formContent;
}

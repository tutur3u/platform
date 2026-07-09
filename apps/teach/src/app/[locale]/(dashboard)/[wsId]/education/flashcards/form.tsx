'use client';

import { useMutation } from '@tanstack/react-query';
import {
  createWorkspaceFlashcard,
  updateWorkspaceFlashcard,
} from '@tuturuuu/internal-api';
import type { WorkspaceFlashcard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId?: string;
  data?: Partial<WorkspaceFlashcard>;

  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  moduleId: z.string().optional(),
  front: z.string().min(1),
  back: z.string().min(1),
});

export default function FlashcardForm({
  wsId,
  moduleId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations('ws-flashcards');
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      moduleId,
      front: data?.front || '',
      back: data?.back || '',
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const saveMutation = useMutation({
    mutationFn: async (payload: z.infer<typeof FormSchema>) => {
      if (payload.id) {
        await updateWorkspaceFlashcard(wsId, payload.id, payload);
        return;
      }
      await createWorkspaceFlashcard(wsId, payload);
    },
  });

  const disabled =
    !isDirty || !isValid || isSubmitting || saveMutation.isPending;

  const onSubmit = async (payload: z.infer<typeof FormSchema>) => {
    try {
      await saveMutation.mutateAsync(payload);
      onFinish?.(payload);
      router.refresh();
    } catch (error) {
      toast({
        title: `Failed to ${payload.id ? 'edit' : 'create'} flashcard`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <FormField
          control={form.control}
          name="front"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('front')}</FormLabel>
              <FormControl>
                <Input placeholder={t('front')} autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="back"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('back')}</FormLabel>
              <FormControl>
                <Input placeholder={t('back')} autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? t('edit') : t('create')}
        </Button>
      </form>
    </Form>
  );
}

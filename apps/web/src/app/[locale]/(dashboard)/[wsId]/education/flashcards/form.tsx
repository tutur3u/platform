'use client';

import { WorkspaceFlashcard } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId?: string;
  data?: Partial<WorkspaceFlashcard>;
  // eslint-disable-next-line no-unused-vars
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

  const form = useForm<z.infer<typeof FormSchema>>({
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

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/flashcards/${data.id}`
          : `/api/v1/workspaces/${wsId}/flashcards`,
        {
          method: data.id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: `Failed to ${data.id ? 'edit' : 'create'} course`,
          description: data.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} course`,
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

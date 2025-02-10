'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tutur3u/ui/components/ui/form';
import { Input } from '@tutur3u/ui/components/ui/input';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId: string;
  link?: string;
  links?: string[];
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  link: z
    .string()
    .min(1, 'Link is required')
    .regex(
      /^(https?:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/,
      'Invalid YouTube link'
    ),
});

export default function YouTubeLinkForm({
  wsId,
  moduleId,
  link,
  links,
  onFinish,
}: Props) {
  const t = useTranslations('ws-course-modules');
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      link: link || '',
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/course-modules/${moduleId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            youtube_links: [...(links || []), data.link],
          }),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: `Failed to ${link ? 'edit' : 'create'} youtube link`,
          description: data.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${link ? 'edit' : 'create'} youtube link`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <FormField
          control={form.control}
          name="link"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('youtube_link')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('youtube_link')}
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {link ? t('edit_link') : t('add_link')}
        </Button>
      </form>
    </Form>
  );
}

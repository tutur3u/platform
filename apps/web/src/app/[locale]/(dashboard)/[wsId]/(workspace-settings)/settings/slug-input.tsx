'use client';

import { Check, Loader2 } from '@tuturuuu/icons';
import { workspaceSlugSchema } from '@tuturuuu/utils/slug-helper';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  slug: workspaceSlugSchema.optional(),
});

export default function SlugInput({
  wsId,
  defaultValue,
  disabled,
}: Props) {
  const t = useTranslations('ws-settings');
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      slug: defaultValue || undefined,
    },
  });

  const slug = form.watch('slug');

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    const res = await fetch(`/api/workspaces/${wsId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const result = await res.json();

      toast({
        title: t('slug_updated_title'),
        description: t('slug_updated_description'),
      });

      // Redirect to the new slug-based URL
      if (result.slug) {
        router.push(`/${result.slug}/settings`);
      } else {
        router.refresh();
      }
    } else {
      const error = await res.json();
      toast({
        title: t('error_occurred'),
        description: error.message || t('try_again'),
        variant: 'destructive',
      });
    }

    setSaving(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem className="w-full">
                <Label htmlFor="workspace-slug">{t('slug')}</Label>
                <FormControl>
                  <Input
                    id="workspace-slug"
                    placeholder={t('slug_placeholder')}
                    disabled={disabled}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t('slug_description')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="icon"
            onClick={form.handleSubmit(onSubmit)}
            disabled={!slug || slug === defaultValue || saving}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

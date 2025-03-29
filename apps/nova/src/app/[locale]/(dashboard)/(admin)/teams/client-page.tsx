'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Loader2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

export default function TeamClient({ onFinish }: { onFinish?: () => void }) {
  const router = useRouter();
  const t = useTranslations();

  const [isLoading, setIsLoading] = useState(false);

  const formSchema = z.object({
    name: z.string().min(1, {
      message: t('validation.required', { field: t('common.name') }),
    }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/nova/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
        }),
      });

      if (res.ok) {
        form.reset();
        router.refresh();
        toast.success(t('teams.create_success'));
        onFinish?.();
      } else {
        const data = await res.json();
        toast.error(data.error || t('teams.create_error'));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('teams.create_error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common.name')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('common.name_placeholder')}
                  {...field}
                  disabled={isLoading}
                />
              </FormControl>
              <FormDescription>{t('teams.name_description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.create')}
        </Button>
      </form>
    </Form>
  );
}

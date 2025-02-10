'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@tutur3u/ui/components/ui/form';
import { Input } from '@tutur3u/ui/components/ui/input';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  name: z.string().min(0).max(50).optional(),
});

export default function DisplayNameInput({
  defaultValue = '',
  disabled,
}: Props) {
  const t = useTranslations('settings-account');
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: defaultValue || '',
    },
  });

  const name = form.watch('name');

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ display_name: data.name }),
    });

    if (res.ok) {
      toast({
        title: 'Profile updated',
        description: 'Your display name has been updated.',
      });

      router.refresh();
    } else {
      toast({
        title: 'An error occurred',
        description: 'Please try again.',
      });
    }

    setSaving(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="flex items-start gap-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Input
                    id="display-name"
                    placeholder={t('display-name')}
                    disabled={disabled}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="icon"
            onClick={form.handleSubmit(onSubmit)}
            disabled={name === defaultValue || saving || disabled}
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

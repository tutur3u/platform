'use client';

import { Check, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  first_day_of_week: z.enum(['sunday', 'monday', 'saturday']),
});

export default function FirstDayOfWeekInput({
  defaultValue = 'monday',
  disabled,
}: Props) {
  const t = useTranslations('settings-account');
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      first_day_of_week: (defaultValue || 'monday') as
        | 'sunday'
        | 'monday'
        | 'saturday',
    },
  });

  const firstDayOfWeek = form.watch('first_day_of_week');
  const hasChanges = firstDayOfWeek !== defaultValue;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    const res = await fetch('/api/users/me/private', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ first_day_of_week: data.first_day_of_week }),
    });

    if (res.ok) {
      toast({
        title: 'Preferences updated',
        description: 'Your first day of week preference has been updated.',
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
            name="first_day_of_week"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled}
                  >
                    <SelectTrigger id="first-day-of-week" className="w-full">
                      <SelectValue
                        placeholder={t('first-day-of-week-placeholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sunday">{t('sunday')}</SelectItem>
                      <SelectItem value="monday">{t('monday')}</SelectItem>
                      <SelectItem value="saturday">{t('saturday')}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {hasChanges && (
            <Button
              type="submit"
              size="icon"
              onClick={form.handleSubmit(onSubmit)}
              disabled={saving || disabled}
              className="shrink-0"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Check className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

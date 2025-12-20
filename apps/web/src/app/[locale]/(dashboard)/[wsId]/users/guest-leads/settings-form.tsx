'use client';

import { useMutation } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

interface Props {
  wsId: string;
  data?: {
    guest_user_checkup_threshold: number | null;
  };
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreateLeadGenerations: boolean;
}

const FormSchema = z.object({
  guest_user_checkup_threshold: z.coerce.number().int().min(1).max(100),
});

export function GuestLeadSettingsForm({
  wsId,
  data,
  onFinish,
  canCreateLeadGenerations,
}: Props) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const row = Array.isArray(data) ? data[0] : data;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      guest_user_checkup_threshold: row?.guest_user_checkup_threshold ?? 5,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof FormSchema>) => {
      const supabase = createClient();
      const { error } = await supabase.from('workspace_settings').upsert({
        ws_id: wsId,
        guest_user_checkup_threshold: values.guest_user_checkup_threshold,
      });
      if (error) throw error;
      return values;
    },
    onSuccess: () => {
      toast.success(t('common.success'));
      router.refresh();
      if (onFinish) {
        onFinish(form.getValues());
      }
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  async function onSubmit(values: z.infer<typeof FormSchema>) {
    setLoading(true);
    try {
      await mutation.mutateAsync(values);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <FormField
          control={form.control}
          name="guest_user_checkup_threshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users.guest_user_checkup_threshold')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={field.value as number | string | undefined}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={
            loading ||
            mutation.isPending ||
            !form.formState.isDirty ||
            !canCreateLeadGenerations
          }
        >
          {loading || mutation.isPending
            ? t('common.processing')
            : t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

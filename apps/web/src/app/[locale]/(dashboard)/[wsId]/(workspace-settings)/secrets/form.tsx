'use client';

import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
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
import { KNOWN_SECRETS } from './constants';

interface Props {
  wsId: string;
  data?: WorkspaceSecret;
  existingSecrets?: string[];

  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  value: z.string().min(1),
});

export const ApiConfigFormSchema = FormSchema;

export default function SecretForm({
  wsId,
  data,
  existingSecrets = [],
  onFinish,
}: Props) {
  const t = useTranslations();
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      value: data?.value || (data?.id ? '' : 'true'),
    },
  });

  const onSubmit = async (data: z.infer<typeof ApiConfigFormSchema>) => {
    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/secrets/${data.id}`
        : `/api/workspaces/${wsId}/secrets`,
      {
        method: data?.id ? 'PUT' : 'POST',
        body: JSON.stringify(data),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} secret`,
        description: data.message,
      });
    }
  };

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t('ws-secrets.name')}</FormLabel>
              <div className="grid gap-2">
                <FormControl>
                  <Combobox
                    t={t}
                    mode="single"
                    className="w-full"
                    placeholder={t('ws-secrets.name')}
                    options={KNOWN_SECRETS.filter(
                      (secret) =>
                        !existingSecrets.includes(secret.name) ||
                        data?.name === secret.name
                    ).map((secret) => ({
                      value: secret.name,
                      label: secret.name,
                    }))}
                    selected={field.value}
                    onChange={(val) => {
                      const value = Array.isArray(val) ? val[0] : val;
                      if (!value) return;

                      field.onChange(value);

                      // Prefill value if it's a known secret and current value is empty or default
                      const secret = KNOWN_SECRETS.find(
                        (s) => s.name === value
                      );
                      const currentValue = form.getValues('value');

                      if (
                        secret?.defaultValue &&
                        (!currentValue || currentValue === 'true')
                      ) {
                        form.setValue('value', secret.defaultValue);
                      }
                    }}
                    onCreate={(val) => {
                      field.onChange(
                        val.replace(/-/g, '_').replace(/\s/g, '_').toUpperCase()
                      );
                    }}
                  />
                </FormControl>
                {KNOWN_SECRETS.find((s) => s.name === field.value) && (
                  <p className="text-muted-foreground text-sm">
                    {
                      KNOWN_SECRETS.find((s) => s.name === field.value)
                        ?.description
                    }
                  </p>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-secrets.value')}</FormLabel>
              <FormControl>
                <Input placeholder="Value" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? t('common.edit') : t('common.create')}
        </Button>
      </form>
    </Form>
  );
}

'use client';

import { useMutation } from '@tanstack/react-query';
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
import {
  KNOWN_SECRETS,
  NON_RATE_LIMIT_SECRETS,
  RATE_LIMIT_SECRETS,
} from './constants';

interface Props {
  wsId: string;
  data?: WorkspaceSecret;
  existingSecrets?: string[];
  secretScope?: 'all' | 'rate-limits' | 'non-rate-limits';
  onSubmitSecret?: (data: z.infer<typeof FormSchema>) => Promise<void> | void;

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
  secretScope = 'all',
  onSubmitSecret,
  onFinish,
}: Props) {
  const t = useTranslations();
  const tCommon = useTranslations('common');
  const router = useRouter();
  const availableSecrets =
    secretScope === 'rate-limits'
      ? RATE_LIMIT_SECRETS
      : secretScope === 'non-rate-limits'
        ? NON_RATE_LIMIT_SECRETS
        : KNOWN_SECRETS;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      value: data?.value || (data?.id ? '' : 'true'),
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: z.infer<typeof ApiConfigFormSchema>) => {
      if (onSubmitSecret) {
        await onSubmitSecret(payload);
        return;
      }

      const res = await fetch(
        payload.id
          ? `/api/workspaces/${wsId}/secrets/${payload.id}`
          : `/api/workspaces/${wsId}/secrets`,
        {
          method: payload.id ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const responsePayload = (await res.json().catch(() => null)) as {
          id?: string;
          message?: string;
        } | null;

        throw new Error(
          responsePayload?.message ||
            `Failed to ${payload.id ? 'edit' : 'create'} secret`
        );
      }
    },
    onSuccess: async (_, payload) => {
      onFinish?.(payload);

      if (!onSubmitSecret) {
        router.refresh();
      }
    },
    onError: (error, payload) => {
      toast({
        title: `Failed to ${payload.id ? 'edit' : 'create'} secret`,
        description:
          error instanceof Error ? error.message : tCommon('500-msg'),
      });
    },
  });

  const onSubmit = async (payload: z.infer<typeof ApiConfigFormSchema>) => {
    await mutation.mutateAsync(payload);
  };

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting || mutation.isPending;

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
                    options={availableSecrets
                      .filter(
                        (secret) =>
                          !existingSecrets.includes(secret.name) ||
                          data?.name === secret.name
                      )
                      .map((secret) => ({
                        value: secret.name,
                        label: secret.name,
                      }))}
                    selected={field.value}
                    onChange={(val) => {
                      const value = Array.isArray(val) ? val[0] : val;
                      if (!value) return;

                      field.onChange(value);

                      // Prefill value if it's a known secret and current value is empty or default
                      const secret = availableSecrets.find(
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
                {availableSecrets.find((s) => s.name === field.value) && (
                  <p className="text-muted-foreground text-sm">
                    {
                      availableSecrets.find((s) => s.name === field.value)
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

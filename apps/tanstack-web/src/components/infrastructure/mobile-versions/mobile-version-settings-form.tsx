'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { updateMobileVersionPolicies } from '@tuturuuu/internal-api/infrastructure/mobile';
import type { MobileVersionPoliciesPayload } from '@tuturuuu/internal-api/infrastructure/types';
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
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createMobileVersionFormSchema,
  MOBILE_VERSION_PLATFORMS,
  type MobileVersionFormValues,
  toMobileVersionFormValues,
  toMobileVersionPoliciesPayload,
} from './mobile-version-form-utils';
import { MobileVersionPlatformCard } from './mobile-version-platform-card';
import { MOBILE_VERSION_POLICIES_QUERY_KEY } from './query-keys';

interface MobileVersionSettingsFormProps {
  initialData: MobileVersionPoliciesPayload;
}

export function MobileVersionSettingsForm({
  initialData,
}: MobileVersionSettingsFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('mobile-version-settings');
  const formSchema = createMobileVersionFormSchema(t);

  const form = useForm<MobileVersionFormValues>({
    defaultValues: toMobileVersionFormValues(initialData),
    resolver: zodResolver(formSchema),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: MobileVersionFormValues) =>
      updateMobileVersionPolicies(toMobileVersionPoliciesPayload(values)),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('save_error'));
    },
    onSuccess: async (response) => {
      form.reset(toMobileVersionFormValues(response.data));
      toast.success(t('save_success'));
      await queryClient.invalidateQueries({
        queryKey: MOBILE_VERSION_POLICIES_QUERY_KEY,
      });
      router.refresh();
    },
  });

  return (
    <Form {...form}>
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {MOBILE_VERSION_PLATFORMS.map((platform) => (
            <MobileVersionPlatformCard
              form={form}
              key={platform}
              platform={platform}
            />
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <FormField
            control={form.control}
            name="webOtpEnabled"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="space-y-1">
                  <FormLabel>{t('web.title')}</FormLabel>
                  <FormDescription>{t('web.description')}</FormDescription>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      {t('fields.otp_enabled')}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t('fields.web_otp_enabled_description')}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          disabled={saveMutation.isPending || !form.formState.isDirty}
          type="submit"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </form>
    </Form>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const FormSchema = z
  .object({
    email: z.string().email(),
    reason: z.string().max(500).optional(),
    clearEmailScoped: z.boolean(),
    clearRelatedIpCounters: z.boolean(),
    clearRelatedIpBlocks: z.boolean(),
  })
  .refine(
    (value) =>
      value.clearEmailScoped ||
      value.clearRelatedIpCounters ||
      value.clearRelatedIpBlocks,
    {
      message: 'Select at least one reset option',
      path: ['clearEmailScoped'],
    }
  );

export type OtpLimitResetFormValues = z.infer<typeof FormSchema>;

interface Props {
  onSubmit: (values: OtpLimitResetFormValues) => Promise<void>;
}

export default function OtpLimitResetForm({ onSubmit }: Props) {
  const t = useTranslations('otp-limit-resets');

  const form = useForm<OtpLimitResetFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: '',
      reason: '',
      clearEmailScoped: true,
      clearRelatedIpCounters: true,
      clearRelatedIpBlocks: false,
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('email')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="off"
                  placeholder="user@example.com"
                />
              </FormControl>
              <FormDescription>{t('email_description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('reason')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  placeholder={t('reason_placeholder')}
                />
              </FormControl>
              <FormDescription>{t('reason_description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <FormField
            control={form.control}
            name="clearEmailScoped"
            render={({ field }) => (
              <FormItem className="flex items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(!!checked)}
                    ref={field.ref}
                  />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel>{t('clear_email_scoped')}</FormLabel>
                  <FormDescription>
                    {t('clear_email_scoped_description')}
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="clearRelatedIpCounters"
            render={({ field }) => (
              <FormItem className="flex items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(!!checked)}
                    ref={field.ref}
                  />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel>{t('clear_related_ip_counters')}</FormLabel>
                  <FormDescription>
                    {t('clear_related_ip_counters_description')}
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="clearRelatedIpBlocks"
            render={({ field }) => (
              <FormItem className="flex items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(!!checked)}
                    ref={field.ref}
                  />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel>{t('clear_related_ip_blocks')}</FormLabel>
                  <FormDescription>
                    {t('clear_related_ip_blocks_description')}
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>

        <FormMessage>
          {form.formState.errors.clearEmailScoped?.message}
        </FormMessage>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>
      </form>
    </Form>
  );
}

'use client';

import { LogIn, Send, Shield } from '@tuturuuu/icons/lucide';
import { createSupportInquiry } from '@tuturuuu/internal-api';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_SUPPORT_INQUIRY_LENGTH,
} from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as z from 'zod';
import { Panel } from '@/components/landing/shared/section-shell';
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile';

const formSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(MAX_DISPLAY_NAME_LENGTH),
  email: z.string().email('Please enter a valid email').max(MAX_EMAIL_LENGTH),
  type: z.enum(['bug', 'feature-request', 'support', 'job-application'], {
    error: 'Please select an inquiry type',
  }),
  product: z.enum([
    'web',
    'nova',
    'rewise',
    'calendar',
    'finance',
    'tudo',
    'tumeet',
    'shortener',
    'qr',
    'drive',
    'mail',
    'other',
  ]),
  subject: z.string().min(5, 'Subject must be at least 5 characters').max(255),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(MAX_SUPPORT_INQUIRY_LENGTH),
});

/** Mono micro-label: the same treatment used for eyebrows across marketing. */
const labelClass =
  'font-mono-ui text-[0.65rem] text-foreground/45 uppercase tracking-[0.18em]';

/** Quiet field surface that still keeps the component's own focus ring. */
const fieldClass =
  'rounded-xl border-foreground/10 bg-foreground/[0.02] transition-colors hover:border-foreground/20';

export function ContactForm() {
  const t = useTranslations('contact');
  const [isLoading, setIsLoading] = useState(false);
  const { data: profile } = useCurrentUserProfile();
  const user = profile
    ? ({ id: profile.id, email: profile.email } as SupabaseUser)
    : null;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      type: 'support' as const,
      product: 'other' as const,
      subject: '',
      message: '',
    },
  });

  useEffect(() => {
    if (!profile) {
      return;
    }

    if (profile.email) {
      form.setValue('email', profile.email);
    }

    const name = profile.display_name || profile.email?.split('@')[0] || '';
    if (name) {
      form.setValue('name', name);
    }
  }, [form, profile]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      toast.error('Authentication required', {
        description: 'Please log in to submit an inquiry.',
      });
      return;
    }

    setIsLoading(true);

    try {
      await createSupportInquiry(values);
      form.reset();
      toast.success('Message sent successfully!', {
        description: "We'll get back to you as soon as possible.",
      });
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      toast.error('Something went wrong', {
        description: 'Please try again later or contact us directly.',
      });
    }
    setIsLoading(false);
  }

  return (
    <Panel className="p-5 sm:p-7">
      {!user && (
        <div className="mb-7 rounded-2xl border border-dynamic-orange/25 bg-dynamic-orange/[0.06] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dynamic-orange/25 bg-dynamic-orange/10">
              <Shield className="h-4 w-4 text-dynamic-orange" />
            </span>
            <div className="flex-1">
              <h3 className={labelClass}>{t('form.authRequired.title')}</h3>
              <p className="mt-2 text-foreground/55 text-xs leading-relaxed">
                {t('form.authRequired.description')}
              </p>
              <Button
                asChild
                className="mt-4 h-9 rounded-full border-dynamic-orange/30 text-dynamic-orange hover:bg-dynamic-orange/10 hover:text-dynamic-orange"
                size="sm"
                variant="outline"
              >
                <Link href="/login">
                  <LogIn className="mr-1.5 h-4 w-4" />
                  {t('form.authRequired.loginButton')}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>
                    {t('form.fields.name.label')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      className={fieldClass}
                      disabled
                      placeholder={t('form.fields.name.placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>
                    {t('form.fields.email.label')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      className={fieldClass}
                      disabled
                      placeholder={t('form.fields.email.placeholder')}
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>
                    {t('form.fields.type.label')}
                  </FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className={fieldClass}>
                        <SelectValue
                          placeholder={t('form.fields.type.placeholder')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="support">
                        {t('form.fields.type.options.support')}
                      </SelectItem>
                      <SelectItem value="bug">
                        {t('form.fields.type.options.bug')}
                      </SelectItem>
                      <SelectItem value="feature-request">
                        {t('form.fields.type.options.featureRequest')}
                      </SelectItem>
                      <SelectItem value="job-application">
                        {t('form.fields.type.options.jobApplication')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>
                    {t('form.fields.product.label')}
                  </FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className={fieldClass}>
                        <SelectValue
                          placeholder={t('form.fields.product.placeholder')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="web">
                        {t('form.fields.product.options.web')}
                      </SelectItem>
                      <SelectItem value="nova">
                        {t('form.fields.product.options.nova')}
                      </SelectItem>
                      <SelectItem value="rewise">
                        {t('form.fields.product.options.rewise')}
                      </SelectItem>
                      <SelectItem value="calendar">
                        {t('form.fields.product.options.calendar')}
                      </SelectItem>
                      <SelectItem value="finance">
                        {t('form.fields.product.options.finance')}
                      </SelectItem>
                      <SelectItem value="tudo">
                        {t('form.fields.product.options.tudo')}
                      </SelectItem>
                      <SelectItem value="tumeet">
                        {t('form.fields.product.options.tumeet')}
                      </SelectItem>
                      <SelectItem value="other">
                        {t('form.fields.product.options.other')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="subject"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>
                  {t('form.fields.subject.label')}
                </FormLabel>
                <FormControl>
                  <Input
                    className={fieldClass}
                    placeholder={t('form.fields.subject.placeholder')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>
                  {t('form.fields.message.label')}
                </FormLabel>
                <FormControl>
                  <Textarea
                    className={cn(fieldClass, 'min-h-[170px] resize-none')}
                    placeholder={t('form.fields.message.placeholder')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            className="group relative h-12 w-full overflow-hidden rounded-full bg-[linear-gradient(100deg,var(--purple),var(--blue))] font-medium text-white shadow-[0_8px_30px_-10px_color-mix(in_oklab,var(--purple)_70%,transparent)] transition-shadow duration-300 hover:shadow-[0_12px_40px_-10px_color-mix(in_oklab,var(--purple)_85%,transparent)]"
            disabled={isLoading || !user}
            size="lg"
            type="submit"
          >
            {isLoading ? (
              t('form.button.sending')
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {t('form.button.send')}
              </>
            )}
          </Button>
        </form>
      </Form>
    </Panel>
  );
}

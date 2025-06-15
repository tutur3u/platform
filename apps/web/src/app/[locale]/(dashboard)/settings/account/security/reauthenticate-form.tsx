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
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as z from 'zod';

const formSchema = z.object({
  otp: z.string().min(6, {
    message: 'OTP must be 6 digits',
  }),
});

export type ReauthenticateFormData = z.infer<typeof formSchema>;

export default function ReauthenticateForm({
  onSubmit,
  onResend,
  loading,
}: {
  onSubmit: (data: ReauthenticateFormData) => Promise<void>;
  onResend: () => Promise<void>;
  loading: boolean;
}) {
  const t = useTranslations();
  const [resendCooldown, setResendCooldown] = useState(60);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      otp: '',
    },
  });

  const handleResend = async () => {
    await onResend();
    setResendCooldown(60);
  };

  // Reduce cooldown by 1 every second
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            For security, please enter the verification code sent to your email
            to continue with the password change.
          </p>
        </div>

        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('login.verification_code')}</FormLabel>
              <FormControl>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    {...field}
                    onChange={(value) => {
                      form.setValue('otp', value);
                      if (value.length === 6) {
                        form.handleSubmit(onSubmit)();
                      }
                    }}
                    disabled={loading}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </FormControl>
              <FormDescription className="text-center">
                Enter the 6-digit code sent to your email
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            className="w-full"
            disabled={loading || form.watch('otp').length < 6}
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={loading || resendCooldown > 0}
          >
            {resendCooldown > 0
              ? `Resend Code (${resendCooldown}s)`
              : 'Resend Code'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

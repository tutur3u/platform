'use client';

import { Mail } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import * as z from 'zod';
import { DEV_MODE, PORT } from '@/constants/common';
import { sendOtpAction, verifyOtpAction } from './actions';

const FormSchema = z.object({
  email: z.email(),
  otp: z.string(),
});

export default function LoginForm() {
  const t = useTranslations();

  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: DEV_MODE ? 'local@tuturuuu.com' : '',
      otp: '',
    },
  });

  useEffect(() => {
    if (DEV_MODE) form.setFocus('email');
  }, [form.setFocus]);

  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Server action transitions
  const [isPendingSendOtp, startSendOtpTransition] = useTransition();
  const [isPendingVerifyOtp, startVerifyOtpTransition] = useTransition();

  // Resend cooldown
  const cooldown = 60;
  const [resendCooldown, setResendCooldown] = useState(0);

  // Combine loading states
  const _isLoading = loading || isPendingSendOtp || isPendingVerifyOtp;

  const maxOTPLength = 6;

  // Update resend cooldown OTP is sent
  useEffect(() => {
    if (otpSent) {
      setResendCooldown(cooldown);

      // if on DEV_MODE, auto-open inbucket
      if (DEV_MODE) {
        window.open(window.location.origin.replace('7805', '8004'), '_blank');
      }
    }
  }, [otpSent]);

  // Reduce cooldown by 1 every second
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [emailForConsent, setEmailForConsent] = useState('');

  const sendOtp = async (data: { email: string }) => {
    if (!data.email) return;

    startSendOtpTransition(async () => {
      try {
        const result = await sendOtpAction({
          email: data.email,
        });

        if (result.error) {
          toast({
            title: t('login.failed'),
            description: result.error,
          });
        } else {
          // Success
          toast({
            title: t('login.success'),
            description: t('login.otp_sent'),
          });

          form.setValue('otp', '');
          form.clearErrors('otp');
          setOtpSent(true);
          setResendCooldown(cooldown);
        }
      } catch (error) {
        console.error('SendOTP Error:', error);
        toast({
          title: t('login.failed'),
          description: t('login.failed_to_send'),
        });
      }
    });
  };

  const verifyOtp = async (data: { email: string; otp: string }) => {
    if (!data.email || !data.otp) return;

    startVerifyOtpTransition(async () => {
      try {
        const result = await verifyOtpAction({
          email: data.email,
          otp: data.otp,
        });

        if (result.error) {
          form.setError('otp', {
            message: t('login.invalid_verification_code'),
          });
          form.setValue('otp', '');

          toast({
            title: t('login.failed'),
            description: result.error,
          });
        } else {
          // Success
          const nextUrl = searchParams.get('nextUrl') ?? '/home';
          console.log('Before redirect:', nextUrl);

          // Save to localStorage to persist after refresh
          localStorage.setItem('nextUrl', nextUrl);

          router.push(nextUrl);
          router.refresh();
        }
      } catch (error) {
        console.error('VerifyOTP Error:', error);

        form.setError('otp', { message: t('login.invalid_verification_code') });
        form.setValue('otp', '');

        toast({
          title: t('login.failed'),
          description: t('login.failed_to_verify'),
        });
      }
    });
  };

  useEffect(() => {
    const storedNextUrl = localStorage.getItem('nextUrl');
    if (storedNextUrl) {
      console.log('After refresh:', storedNextUrl);
      localStorage.removeItem('nextUrl'); // Clear after logging
    }
  }, []);

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const { email, otp } = data;

    if (!otpSent) {
      setEmailForConsent(email);
      setShowConsentDialog(true);
    } else if (otp) await verifyOtp({ email, otp });
    else {
      setLoading(false);
      toast({
        title: 'Error',
        description:
          'Please enter the OTP code sent to your email to continue.',
      });
    }
  }

  return (
    <>
      <AlertDialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('auth.tos')} & {t('auth.privacy')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('auth.by_continuing')}{' '}
              <Link
                href="https://tuturuuu.com/terms"
                target="_blank"
                className="font-semibold underline hover:text-foreground"
              >
                {t('auth.tos')}
              </Link>{' '}
              and{' '}
              <Link
                href="https://tuturuuu.com/privacy"
                target="_blank"
                className="font-semibold underline hover:text-foreground"
              >
                {t('auth.privacy')}
              </Link>
              . {t('auth.consent_notice')}
              <br />
              <br />
              {t('auth.your_email')}{' '}
              <span className="font-semibold text-foreground">
                "{emailForConsent}"
              </span>{' '}
              {t('auth.will_be_sent')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowConsentDialog(false);
                setLoading(false);
              }}
            >
              {t('auth.decline')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowConsentDialog(false);
                await sendOtp({ email: emailForConsent });
              }}
            >
              {t('auth.accept_and_continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('login.email_placeholder')}
                    {...field}
                    disabled={otpSent || _isLoading}
                  />
                </FormControl>

                {otpSent || (
                  <FormDescription>
                    {t('login.email_description')}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="otp"
            render={({ field }) => (
              <FormItem className={otpSent ? '' : 'hidden'}>
                <FormLabel>{t('login.otp_code')}</FormLabel>
                <FormControl>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <InputOTP
                      maxLength={maxOTPLength}
                      {...field}
                      onChange={(value) => {
                        form.setValue('otp', value);
                        if (value.length === maxOTPLength)
                          form.handleSubmit(onSubmit)();
                      }}
                      disabled={_isLoading}
                    >
                      <InputOTPGroup className="w-full justify-center">
                        {Array.from({ length: maxOTPLength }).map(
                          (_, index) => (
                            <InputOTPSlot
                              key={`otp-${index + 1}`}
                              index={index}
                              className="max-md:w-full"
                            />
                          )
                        )}
                      </InputOTPGroup>
                    </InputOTP>

                    <Button
                      onClick={() =>
                        sendOtp({ email: form.getValues('email') })
                      }
                      disabled={_isLoading || resendCooldown > 0}
                      className="md:w-full"
                      variant="secondary"
                      type="button"
                    >
                      {resendCooldown > 0
                        ? `${t('login.resend')} (${resendCooldown})`
                        : t('login.resend')}
                    </Button>
                  </div>
                </FormControl>
                {form.formState.errors.otp && (
                  <FormMessage>{form.formState.errors.otp.message}</FormMessage>
                )}
                <FormDescription>{t('login.otp_description')}</FormDescription>
              </FormItem>
            )}
          />

          {otpSent && DEV_MODE && (
            <div className="grid gap-2 md:grid-cols-2">
              <Link
                href={window.location.origin.replace(PORT.toString(), '8004')}
                target="_blank"
                className="col-span-full"
                aria-disabled={_isLoading}
              >
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={_isLoading}
                >
                  <Mail size={18} className="mr-1" />
                  {t('login.open_inbucket')}
                </Button>
              </Link>
            </div>
          )}

          <div className="grid gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={
                _isLoading ||
                form.formState.isSubmitting ||
                !form.formState.isValid ||
                (otpSent && !form.formState.dirtyFields.otp)
              }
            >
              {_isLoading ? t('login.processing') : t('login.continue')}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}

'use client';

import { DEV_MODE } from '@/constants/common';
import { generateCrossAppToken, mapUrlToApp } from '@tuturuuu/auth/cross-app';
import { createClient } from '@tuturuuu/supabase/next/client';
import { SupabaseUser } from '@tuturuuu/supabase/next/user';
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
import { Mail } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import * as z from 'zod';

const FormSchema = z.object({
  email: z.string().email(),
  otp: z.string(),
});

export default function LoginForm() {
  const supabase = createClient();

  const t = useTranslations('login');
  const locale = useLocale();

  const router = useRouter();
  const searchParams = useSearchParams();

  const [initialized, setInitialized] = useState(false);
  const [readyForAuth, setReadyForAuth] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setInitialized(true);
    }

    checkUser();
  }, []);

  const processNextUrl = useCallback(async () => {
    const returnUrl = searchParams.get('returnUrl');

    if (returnUrl) {
      const returnApp = mapUrlToApp(returnUrl);
      console.log(returnApp);
      if (!returnApp) throw new Error('Invalid returnUrl');

      const token = await generateCrossAppToken(supabase, returnApp, 'web');

      console.log('Cross App Token', token);
      if (!token) {
        console.error('Failed to generate token');
        return;
      }

      // construct nextUrl with searchParams
      const nextUrl = new URL(returnUrl);
      nextUrl.searchParams.set('token', token);
      nextUrl.searchParams.set('originApp', 'web');
      nextUrl.searchParams.set('targetApp', returnApp);
      nextUrl.searchParams.set('locale', locale);

      // Redirect to the nextUrl
      router.push(nextUrl.toString());
      router.refresh();
      return;
    }

    const nextUrl = searchParams.get('nextUrl');

    if (nextUrl) {
      router.push(nextUrl);
    } else {
      router.push('/');
    }

    router.refresh();
  }, [searchParams, router]);

  useEffect(() => {
    const processUrl = async () => {
      // Check if the user is logged in
      if (user) await processNextUrl();
      else {
        setReadyForAuth(true);
      }
    };

    if (initialized) {
      processUrl();
    }
  }, [user, initialized]);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: DEV_MODE ? 'local@tuturuuu.com' : '',
      otp: '',
    },
  });

  useEffect(() => {
    if (DEV_MODE) form.setFocus('email');
  }, [DEV_MODE]);

  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Resend cooldown
  const cooldown = 60;
  const [resendCooldown, setResendCooldown] = useState(0);

  const maxOTPLength = 6;

  // Update resend cooldown OTP is sent
  useEffect(() => {
    if (otpSent) {
      setResendCooldown(cooldown);

      // if on DEV_MODE, auto-open inbucket
      if (DEV_MODE) {
        window.open(window.location.origin.replace('7803', '8004'), '_blank');
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

  const sendOtp = async (data: { email: string }) => {
    if (!locale || !data.email) return;
    setLoading(true);

    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ ...data, locale }),
    });

    if (res.ok) {
      // Notify user
      toast({
        title: t('success'),
        description: t('otp_sent'),
      });

      // OTP has been sent
      form.setValue('otp', '');
      form.clearErrors('otp');
      setOtpSent(true);

      // Reset cooldown
      setResendCooldown(cooldown);
    } else {
      toast({
        title: t('failed'),
        description: t('failed_to_send'),
      });
    }

    setLoading(false);
  };

  const verifyOtp = async (data: { email: string; otp: string }) => {
    if (!locale || !data.email || !data.otp) return;
    setLoading(true);

    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ ...data, locale }),
    });

    if (res.ok) {
      // reload the page
      window.location.reload();
    } else {
      setLoading(false);

      form.setError('otp', { message: t('invalid_verification_code') });
      form.setValue('otp', '');

      toast({
        title: t('failed'),
        description: t('failed_to_verify'),
      });
    }
  };

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const { email, otp } = data;

    if (!otpSent) await sendOtp({ email });
    else if (otp) await verifyOtp({ email, otp });
    else {
      setLoading(false);
      toast({
        title: 'Error',
        description:
          'Please enter the OTP code sent to your email to continue.',
      });
    }
  }

  // Google login function
  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();

    // Pass the returnUrl and/or nextUrl to the callback
    const returnUrl = searchParams.get('returnUrl');
    const nextUrl = searchParams.get('nextUrl');

    // Build the redirect URL with query parameters
    let redirectTo = `${window.location.origin}/api/auth/callback`;
    const params = new URLSearchParams();

    if (returnUrl) params.append('returnUrl', returnUrl);
    if (nextUrl) params.append('nextUrl', nextUrl);

    const queryString = params.toString();
    if (queryString) redirectTo += `?${queryString}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      setLoading(false);
      toast({
        title: t('failed'),
        description: error.message,
      });
    }
  };

  return (
    <div className="mt-8 space-y-4">
      <Button
        onClick={handleGoogleLogin}
        disabled={loading || !readyForAuth}
        className="w-full"
        variant="outline"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="mr-2 h-5 w-5"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
          <path d="M1 1h22v22H1z" fill="none" />
        </svg>
        {t('continue_with_google')}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            {t('or_continue_with')}
          </span>
        </div>
      </div>

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
                    placeholder={t('email_placeholder')}
                    {...field}
                    disabled={otpSent || loading || !readyForAuth}
                  />
                </FormControl>

                {otpSent || (
                  <FormDescription>{t('email_description')}</FormDescription>
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
                <FormLabel>{t('otp_code')}</FormLabel>
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
                      disabled={loading || !readyForAuth}
                    >
                      <InputOTPGroup className="w-full justify-center">
                        {Array.from({ length: maxOTPLength }).map(
                          (_, index) => (
                            <InputOTPSlot
                              key={index}
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
                      disabled={loading || resendCooldown > 0 || !readyForAuth}
                      className="md:w-full"
                      variant="secondary"
                      type="button"
                    >
                      {resendCooldown > 0
                        ? `${t('resend')} (${resendCooldown})`
                        : t('resend')}
                    </Button>
                  </div>
                </FormControl>
                {form.formState.errors.otp && (
                  <FormMessage>{form.formState.errors.otp.message}</FormMessage>
                )}
                <FormDescription>{t('otp_description')}</FormDescription>
              </FormItem>
            )}
          />

          {otpSent && DEV_MODE && (
            <div className="grid gap-2 md:grid-cols-2">
              <Link
                href={window.location.origin.replace('7803', '8004')}
                target="_blank"
                className="col-span-full"
                aria-disabled={loading}
              >
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={loading}
                >
                  <Mail size={18} className="mr-1" />
                  {t('open_inbucket')}
                </Button>
              </Link>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading || (otpSent && !form.getValues('otp')) || !readyForAuth
            }
          >
            {loading ? t('processing') : otpSent ? t('verify') : t('continue')}
          </Button>
        </form>
      </Form>
    </div>
  );
}

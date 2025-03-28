'use client';

import { DEV_MODE } from '@/constants/common';
import { generateCrossAppToken, mapUrlToApp } from '@tuturuuu/auth/cross-app';
import { createClient } from '@tuturuuu/supabase/next/client';
import { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
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
import { Mail } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
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

  const t = useTranslations();
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
        title: t('login.success'),
        description: t('login.otp_sent'),
      });

      // OTP has been sent
      form.setValue('otp', '');
      form.clearErrors('otp');
      setOtpSent(true);

      // Reset cooldown
      setResendCooldown(cooldown);
    } else {
      toast({
        title: t('login.failed'),
        description: t('login.failed_to_send'),
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

      form.setError('otp', { message: t('login.invalid_verification_code') });
      form.setValue('otp', '');

      toast({
        title: t('login.failed'),
        description: t('login.failed_to_verify'),
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
        title: t('login.failed'),
        description: error.message,
      });
    }
  };

  // GitHub login function
  const handleGitHubLogin = async () => {
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
      provider: 'github',
      options: {
        redirectTo,
      },
    });

    if (error) {
      setLoading(false);
      toast({
        title: t('login.failed'),
        description: error.message,
      });
    }
  };

  if (!readyForAuth)
    return (
      <div className="mt-4 flex h-full w-full items-center justify-center">
        <LoadingIndicator className="h-10 w-10" />
      </div>
    );

  return (
    <Card className="mx-auto mt-8 w-full max-w-md shadow-md">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleGoogleLogin}
              disabled={loading || !readyForAuth}
              className="w-full font-semibold"
              variant="outline"
              type="button"
              size="lg"
            >
              <Image
                src="/media/google-logo.png"
                alt="Google"
                width={20}
                height={20}
              />
              Google
            </Button>

            <Button
              onClick={handleGitHubLogin}
              disabled={loading || !readyForAuth}
              className="w-full font-semibold"
              variant="outline"
              type="button"
              size="lg"
            >
              <Image
                src="/media/github-mark.png"
                alt="GitHub"
                width={20}
                height={20}
              />
              GitHub
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">
                {t('login.or_continue_with')}
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
                        placeholder={t('login.email_placeholder')}
                        {...field}
                        disabled={otpSent || loading || !readyForAuth}
                        className="h-10"
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
                          disabled={
                            loading || resendCooldown > 0 || !readyForAuth
                          }
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
                      <FormMessage>
                        {form.formState.errors.otp.message}
                      </FormMessage>
                    )}
                    <FormDescription>
                      {t('login.otp_description')}
                    </FormDescription>
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
                      {t('login.open_inbucket')}
                    </Button>
                  </Link>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={
                  loading ||
                  (otpSent && !form.getValues('otp')) ||
                  !readyForAuth
                }
              >
                {loading
                  ? t('login.processing')
                  : otpSent
                    ? t('login.verify')
                    : t('login.continue')}
              </Button>
            </form>
          </Form>

          <Separator className="mt-2" />
          <div className="text-foreground/50 text-balance text-center text-sm font-semibold">
            {t('auth.notice-p1')}{' '}
            <Link
              href="/terms"
              target="_blank"
              className="text-foreground/70 decoration-foreground/70 hover:text-foreground hover:decoration-foreground underline underline-offset-2 transition"
            >
              {t('auth.tos')}
            </Link>{' '}
            {t('common.and')}{' '}
            <Link
              href="/privacy"
              target="_blank"
              className="text-foreground/70 decoration-foreground/70 hover:text-foreground hover:decoration-foreground underline underline-offset-2 transition"
            >
              {t('auth.privacy')}
            </Link>{' '}
            {t('auth.notice-p2')}.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

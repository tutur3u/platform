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
import { Eye, EyeOff, Github, Lock, Mail } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import * as z from 'zod';

export default function LoginForm({ isExternal }: { isExternal: boolean }) {
  const supabase = createClient();
  const t = useTranslations();
  const locale = useLocale();

  const PasswordFormSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  const OTPFormSchema = z.object({
    email: z.string().email(),
    otp: z.string(),
  });

  const router = useRouter();
  const searchParams = useSearchParams();

  const passwordless = searchParams.get('passwordless') !== 'false';

  const [initialized, setInitialized] = useState(false);
  const [readyForAuth, setReadyForAuth] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loginMethod, setLoginMethod] = useState<'passwordless' | 'password'>(
    passwordless ? 'passwordless' : 'password'
  );
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (passwordless) {
      setLoginMethod('passwordless');
    } else {
      setLoginMethod('password');
    }
  }, [passwordless]);

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

      if (returnApp === 'web') {
        router.push(returnUrl);
        return;
      }

      const token = await generateCrossAppToken(supabase, returnApp, 'web');
      await supabase.auth.refreshSession();

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

  // Form for OTP (passwordless) login
  const otpForm = useForm({
    resolver: zodResolver(OTPFormSchema),
    defaultValues: {
      email: DEV_MODE ? 'local@tuturuuu.com' : '',
      otp: '',
    },
  });

  // Form for password-based login
  const passwordForm = useForm({
    resolver: zodResolver(PasswordFormSchema),
    defaultValues: {
      email: DEV_MODE ? 'local@tuturuuu.com' : '',
      password: '',
    },
  });

  useEffect(() => {
    if (DEV_MODE) {
      if (loginMethod === 'passwordless') {
        otpForm.setFocus('email');
      } else {
        passwordForm.setFocus('email');
      }
    }
  }, [DEV_MODE, loginMethod]);

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
      otpForm.setValue('otp', '');
      otpForm.clearErrors('otp');
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

      otpForm.setError('otp', {
        message: t('login.invalid_verification_code'),
      });
      otpForm.setValue('otp', '');

      toast({
        title: t('login.failed'),
        description: t('login.failed_to_verify'),
      });
    }
  };

  const loginWithPassword = async (data: {
    email: string;
    password: string;
  }) => {
    if (!locale || !data.email || !data.password) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        throw error;
      }

      // On successful login, reload the page
      window.location.reload();
    } catch (error) {
      setLoading(false);
      passwordForm.setError('password', {
        message: t('login.invalid_credentials'),
      });

      toast({
        title: t('login.failed'),
        description: t('login.invalid_credentials'),
      });
    }
  };

  async function onOtpSubmit(data: z.infer<typeof OTPFormSchema>) {
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

  async function onPasswordSubmit(data: z.infer<typeof PasswordFormSchema>) {
    await loginWithPassword(data);
  }

  // Google login function
  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();

    // Pass the returnUrl and/or nextUrl to the callback
    const returnUrl = searchParams.get('returnUrl');
    const nextUrl = searchParams.get('nextUrl');

    // Build the redirect URL with query parameters
    let redirectURL = `${window.location.origin}/${locale}/login`;
    const searchParamsArray = [];

    if (returnUrl)
      searchParamsArray.push(`returnUrl=${encodeURIComponent(returnUrl)}`);
    if (nextUrl)
      searchParamsArray.push(`nextUrl=${encodeURIComponent(nextUrl)}`);

    if (searchParamsArray.length > 0) {
      redirectURL += `?${searchParamsArray.join('&')}`;
    }

    // Sign in with Google
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectURL,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      setLoading(false);
      console.error('Error signing in with Google:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign in with Google.',
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
    let redirectURL = `${window.location.origin}/${locale}/login`;
    const searchParamsArray = [];

    if (returnUrl)
      searchParamsArray.push(`returnUrl=${encodeURIComponent(returnUrl)}`);
    if (nextUrl)
      searchParamsArray.push(`nextUrl=${encodeURIComponent(nextUrl)}`);

    if (searchParamsArray.length > 0) {
      redirectURL += `?${searchParamsArray.join('&')}`;
    }

    // Sign in with GitHub
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectURL,
      },
    });

    if (error) {
      setLoading(false);
      console.error('Error signing in with GitHub:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign in with GitHub.',
      });
    }
  };

  if (!initialized) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  if (!readyForAuth) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  return (
    <Card className="overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl">
      <CardContent className="space-y-6 p-8">
        <div className="space-y-2 text-center">
          {isExternal && (
            <h2 className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-2xl font-bold text-transparent dark:from-white dark:to-gray-300">
              {t('login.welcome')}
            </h2>
          )}
          <p className="text-muted-foreground text-sm">
            {t('login.choose_sign_in_method')}
          </p>
        </div>

        <Tabs
          className="w-full"
          value={loginMethod}
          defaultValue={loginMethod}
          onValueChange={(value) =>
            setLoginMethod(value as 'passwordless' | 'password')
          }
        >
          <TabsList className="grid w-full grid-cols-2 rounded-xl bg-gray-100/50 p-1 backdrop-blur-sm dark:bg-gray-800/50">
            <TabsTrigger
              value="passwordless"
              className="rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-gray-700"
            >
              {t('login.passwordless')}
            </TabsTrigger>
            <TabsTrigger
              value="password"
              className="rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-gray-700"
            >
              {t('login.with_password')}
            </TabsTrigger>
          </TabsList>

          {/* Passwordless (OTP) Login */}
          <TabsContent value="passwordless" className="mt-6 space-y-4">
            <Form {...otpForm}>
              <form
                onSubmit={otpForm.handleSubmit(onOtpSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={otpForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('login.email')}
                      </FormLabel>
                      <FormControl>
                        <div className="group relative">
                          <Mail className="text-muted-foreground group-focus-within:text-primary absolute left-3 top-1/2 size-4 -translate-y-1/2 transition-colors" />
                          <Input
                            className="focus:border-primary/50 focus:ring-primary/20 h-12 bg-white/50 pl-10 transition-all duration-200 focus:ring-2 dark:border-gray-700/50 dark:bg-gray-800/50"
                            placeholder={t('login.email_placeholder')}
                            {...field}
                            disabled={otpSent || loading}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {otpSent && (
                  <FormField
                    control={otpForm.control}
                    name="otp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('login.verification_code')}
                        </FormLabel>
                        <FormControl>
                          <InputOTP
                            maxLength={maxOTPLength}
                            {...field}
                            disabled={loading}
                            className="justify-center"
                          >
                            <InputOTPGroup className="w-full gap-2">
                              {Array.from({ length: maxOTPLength }).map(
                                (_, i) => (
                                  <InputOTPSlot
                                    key={i}
                                    index={i}
                                    className="focus:border-primary focus:ring-primary/20 h-12 w-full rounded-lg border bg-white/50 text-lg font-semibold transition-all duration-200 focus:ring-2 dark:border-gray-700/50 dark:bg-gray-800/50"
                                  />
                                )
                              )}
                            </InputOTPGroup>
                          </InputOTP>
                        </FormControl>
                        <FormDescription className="text-muted-foreground text-center text-sm">
                          {t('login.check_email')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <Button
                  type="submit"
                  variant={loading ? 'outline' : undefined}
                  className="h-12 w-full transform font-medium shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
                  disabled={
                    loading ||
                    (otpSent && otpForm.watch('otp').length !== maxOTPLength)
                  }
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <LoadingIndicator className="h-4 w-4" />
                      <span>{t('common.loading')}...</span>
                    </div>
                  ) : otpSent ? (
                    t('login.verify')
                  ) : (
                    t('login.continue')
                  )}
                </Button>

                {otpSent && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full bg-white/50 transition-all duration-200 hover:bg-white/80 dark:border-gray-700/50 dark:bg-gray-800/50 dark:hover:bg-gray-800/80"
                    disabled={loading || resendCooldown > 0}
                    onClick={() => {
                      otpForm.handleSubmit(onOtpSubmit)();
                    }}
                  >
                    {resendCooldown > 0
                      ? `${t('login.resend')} (${resendCooldown}s)`
                      : t('login.resend')}
                  </Button>
                )}
              </form>
            </Form>
          </TabsContent>

          {/* Password Login */}
          <TabsContent value="password" className="mt-6 space-y-4">
            <Form {...passwordForm}>
              <form
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={passwordForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('login.email')}
                      </FormLabel>
                      <FormControl>
                        <div className="group relative">
                          <Mail className="text-muted-foreground group-focus-within:text-primary absolute left-3 top-1/2 size-4 -translate-y-1/2 transition-colors" />
                          <Input
                            className="focus:border-primary/50 focus:ring-primary/20 h-12 bg-white/50 pl-10 transition-all duration-200 focus:ring-2 dark:border-gray-700/50 dark:bg-gray-800/50"
                            placeholder={t('login.email_placeholder')}
                            {...field}
                            disabled={loading}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('login.password')}
                      </FormLabel>
                      <FormControl>
                        <div className="group relative">
                          <Lock className="text-muted-foreground group-focus-within:text-primary absolute left-3 top-1/2 size-4 -translate-y-1/2 transition-colors" />
                          <Input
                            className="focus:border-primary/50 focus:ring-primary/20 h-12 bg-white/50 pl-10 pr-12 transition-all duration-200 focus:ring-2 dark:border-gray-700/50 dark:bg-gray-800/50"
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('login.password_placeholder')}
                            {...field}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  variant={loading ? 'outline' : undefined}
                  className="h-12 w-full transform font-medium shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
                  disabled={loading || !passwordForm.formState.isValid}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <LoadingIndicator className="h-4 w-4" />
                      <span>{t('common.loading')}...</span>
                    </div>
                  ) : (
                    t('login.sign_in')
                  )}
                </Button>

                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    className="text-primary hover:text-primary/80 text-sm transition-colors duration-200"
                    onClick={() => {
                      setLoginMethod('passwordless');
                      passwordForm.reset();
                    }}
                  >
                    {t('login.forgot_password')}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>

        {loginMethod === 'passwordless' && (
          <>
            <div className="relative my-6">
              <Separator className="bg-gray-200/50 dark:bg-gray-700/50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-muted-foreground rounded-full border bg-white/80 px-3 py-1 text-xs font-medium backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/80">
                  {t('login.or')}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="group relative h-12 w-full transform bg-white/50 transition-all duration-200 hover:scale-[1.02] hover:bg-white/80 dark:border-gray-700/50 dark:bg-gray-800/50 dark:hover:bg-gray-800/80"
              >
                <div className="absolute left-4">
                  <Image
                    src="/media/google-logo.png"
                    alt="Google"
                    width={20}
                    height={20}
                    className="object-contain transition-transform duration-200 group-hover:scale-110"
                  />
                </div>
                <span className="font-medium">
                  {t('login.continue_with_google')}
                </span>
              </Button>

              <Button
                variant="outline"
                onClick={handleGitHubLogin}
                disabled={loading}
                className="group relative h-12 w-full transform bg-white/50 transition-all duration-200 hover:scale-[1.02] hover:bg-white/80 dark:border-gray-700/50 dark:bg-gray-800/50 dark:hover:bg-gray-800/80"
              >
                <div className="absolute left-4">
                  <Github className="size-5 transition-transform duration-200 group-hover:scale-110" />
                </div>
                <span className="font-medium">
                  {t('login.continue_with_github')}
                </span>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

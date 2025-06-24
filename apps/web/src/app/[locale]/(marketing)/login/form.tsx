'use client';

import { generateCrossAppToken, mapUrlToApp } from '@tuturuuu/auth/cross-app';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
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
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import * as z from 'zod';
import { DEV_MODE } from '@/constants/common';

// Constants
const COOLDOWN_DURATION = 60;
const MAX_OTP_LENGTH = 6;

export default function LoginForm({ isExternal }: { isExternal: boolean }) {
  const supabase = createClient();
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Schema Definitions
  const passwordFormSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, t('login.password_min_length')),
  });

  const OTPFormSchema = z.object({
    email: z.string().email(),
    otp: z.string(),
  });

  const TOTPFormSchema = z.object({
    totp: z.string().length(6, 'TOTP code must be 6 digits'),
  });

  // Form Hooks
  const otpForm = useForm({
    resolver: zodResolver(OTPFormSchema),
    defaultValues: {
      email: DEV_MODE ? 'local@tuturuuu.com' : '',
      otp: '',
    },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      email: DEV_MODE ? 'local@tuturuuu.com' : '',
      password: '',
    },
  });

  const totpForm = useForm({
    resolver: zodResolver(TOTPFormSchema),
    defaultValues: {
      totp: '',
    },
  });

  // State Management
  const passwordless = searchParams.get('passwordless') !== 'false';
  const [initialized, setInitialized] = useState(false);
  const [readyForAuth, setReadyForAuth] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [requiresMFA, setRequiresMFA] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'passwordless' | 'password'>(
    passwordless ? 'passwordless' : 'password'
  );
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // URL Processing Helper
  const processNextUrl = useCallback(async () => {
    const returnUrl = searchParams.get('returnUrl');

    if (returnUrl) {
      const returnApp = mapUrlToApp(returnUrl);
      console.log(returnApp);

      if (!returnApp) throw new Error('Invalid returnUrl');

      if (returnApp === 'web') {
        router.push(returnUrl);
        router.refresh();
        return;
      }

      const token = await generateCrossAppToken(supabase, returnApp, 'web');
      await supabase.auth.refreshSession();

      console.log('Cross App Token', token);
      if (!token) {
        console.error('Failed to generate token');
        return;
      }

      const nextUrl = new URL(decodeURIComponent(returnUrl));
      nextUrl.searchParams.set('token', token);
      nextUrl.searchParams.set('originApp', 'web');
      nextUrl.searchParams.set('targetApp', returnApp);
      nextUrl.searchParams.set('locale', locale);

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
  }, [searchParams, router, locale, supabase]);

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

      if (error) throw error;
      router.refresh();

      if (await needsMFA()) {
        setRequiresMFA(true);
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error signing in with password:', error);
      passwordForm.setError('password', {
        message: t('login.invalid_credentials'),
      });

      toast({
        title: t('login.failed'),
        description: t('login.invalid_credentials'),
      });
    }

    setLoading(false);
  };

  // Authentication Functions
  const sendOtp = async (data: { email: string }) => {
    if (!locale || !data.email) return;
    setLoading(true);

    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ ...data, locale }),
    });

    if (res.ok) {
      toast({
        title: t('login.success'),
        description: t('login.otp_sent'),
      });

      otpForm.setValue('otp', '');
      otpForm.clearErrors('otp');
      setOtpSent(true);
      setResendCooldown(COOLDOWN_DURATION);

      if (DEV_MODE) {
        window.open(window.location.origin.replace('7803', '8004'), '_blank');
      }
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
      router.refresh();

      if (await needsMFA()) {
        setRequiresMFA(true);
        setLoading(false);
      } else {
        window.location.reload();
      }
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

  const needsMFA = async () => {
    const { data: assuranceLevel } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      assuranceLevel?.currentLevel === 'aal1' &&
      assuranceLevel?.nextLevel === 'aal2'
    )
      return true;

    return false;
  };

  const verifyTOtp = async (data: { totp: string }) => {
    if (!data.totp) return;
    setLoading(true);

    try {
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError) throw factorsError;

      const verifiedFactors =
        factors?.totp?.filter((factor) => factor.status === 'verified') || [];

      if (verifiedFactors.length === 0) {
        throw new Error('No verified TOTP factor found');
      }

      let verificationSuccess = false;
      let lastError: any = null;

      for (const factor of verifiedFactors) {
        try {
          const { data: challenge, error: challengeError } =
            await supabase.auth.mfa.challenge({
              factorId: factor.id,
            });

          if (challengeError) continue;

          const { error: verifyError } = await supabase.auth.mfa.verify({
            factorId: factor.id,
            challengeId: challenge.id,
            code: data.totp,
          });

          if (!verifyError) {
            verificationSuccess = true;
            break;
          }

          lastError = verifyError;
        } catch (error) {
          lastError = error;
        }
      }

      if (!verificationSuccess) {
        throw lastError || new Error('Verification failed for all factors');
      }

      // Handle redirect after successful MFA verification
      const nextUrl = searchParams.get('nextUrl');
      const returnUrl = searchParams.get('returnUrl');

      if (nextUrl) {
        router.push(decodeURIComponent(nextUrl));
        router.refresh();
        return;
      }

      if (returnUrl) {
        await processNextUrl();
        router.refresh();
        return;
      }

      router.refresh();
    } catch (error) {
      console.error('Error verifying TOTP:', error);
      totpForm.setError('totp', {
        message: t('login.invalid_verification_code'),
      });
      totpForm.setValue('totp', '');

      setLoading(false);

      toast({
        title: t('login.failed'),
        description: t('login.invalid_verification_code'),
      });
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();

    const returnUrl = searchParams.get('returnUrl');
    const nextUrl = searchParams.get('nextUrl');
    let redirectURL = `${window.location.origin}/${locale}/login`;
    const searchParamsArray = [];

    if (returnUrl)
      searchParamsArray.push(`returnUrl=${encodeURIComponent(returnUrl)}`);
    if (nextUrl)
      searchParamsArray.push(`nextUrl=${encodeURIComponent(nextUrl)}`);

    if (searchParamsArray.length > 0) {
      redirectURL += `?${searchParamsArray.join('&')}`;
    }

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

  const handleGitHubLogin = async () => {
    setLoading(true);
    const supabase = createClient();

    const returnUrl = searchParams.get('returnUrl');
    const nextUrl = searchParams.get('nextUrl');
    let redirectURL = `${window.location.origin}/${locale}/login`;
    const searchParamsArray = [];

    if (returnUrl)
      searchParamsArray.push(`returnUrl=${encodeURIComponent(returnUrl)}`);
    if (nextUrl)
      searchParamsArray.push(`nextUrl=${encodeURIComponent(nextUrl)}`);

    if (searchParamsArray.length > 0) {
      redirectURL += `?${searchParamsArray.join('&')}`;
    }

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

  const onPasswordSubmit = async (data: z.infer<typeof passwordFormSchema>) => {
    await loginWithPassword(data);
  };

  const onOtpSubmit = async (data: z.infer<typeof OTPFormSchema>) => {
    const { email, otp } = data;

    if (!otpSent) await sendOtp({ email });
    else if (otp) await verifyOtp({ email, otp });
    else {
      toast({
        title: 'Error',
        description:
          'Please enter the OTP code sent to your email to continue.',
      });
    }

    setLoading(false);
  };

  const onTOtpSubmit = async (data: z.infer<typeof TOTPFormSchema>) => {
    await verifyTOtp(data);
  };

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

      // Always check if MFA is needed when user is logged in
      if (user) {
        const needsAuth = await needsMFA();
        setRequiresMFA(needsAuth);
      } else {
        setRequiresMFA(false);
      }

      setInitialized(true);
    }

    checkUser();
  }, [needsMFA, supabase.auth.getUser]);

  useEffect(() => {
    const processUrl = async () => {
      if (user && !requiresMFA) {
        await processNextUrl();
      } else {
        setReadyForAuth(true);
      }
    };

    if (initialized) {
      processUrl();
    }
  }, [user, initialized, requiresMFA, processNextUrl]);

  useEffect(() => {
    if (DEV_MODE) {
      if (loginMethod === 'passwordless') {
        otpForm.setFocus('email');
      } else {
        passwordForm.setFocus('email');
      }
    }
  }, [loginMethod, otpForm.setFocus, passwordForm.setFocus]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Loading States
  if (!initialized || !readyForAuth) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  // MFA State
  if (requiresMFA) {
    return (
      <Card className="overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl">
        <CardContent className="space-y-6 p-8">
          <div className="space-y-2 text-center">
            <h2 className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-2xl font-bold text-transparent dark:from-white dark:to-gray-300">
              Two-Factor Authentication
            </h2>
            <p className="text-sm text-balance text-muted-foreground">
              Enter your 6-digit verification code from your authenticator app
            </p>
          </div>

          <Form {...totpForm}>
            <form
              onSubmit={totpForm.handleSubmit(onTOtpSubmit)}
              className="space-y-6"
            >
              <FormField
                control={totpForm.control}
                name="totp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Verification Code
                    </FormLabel>
                    <FormControl>
                      <InputOTP
                        maxLength={6}
                        {...field}
                        disabled={loading}
                        className="justify-center"
                      >
                        <InputOTPGroup className="w-full gap-2">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="h-12 w-full rounded-lg border bg-white/50 text-lg font-semibold transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                variant={loading ? 'outline' : undefined}
                className="h-12 w-full transform font-medium shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
                disabled={loading || totpForm.watch('totp').length !== 6}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <LoadingIndicator className="h-4 w-4" />
                    <span>{t('common.loading')}...</span>
                  </div>
                ) : (
                  'Verify'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  }

  // Main Login Form
  return (
    <Card className="overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl">
      <CardContent className="space-y-6 p-8">
        <div className="space-y-2 text-center">
          {isExternal && (
            <h2 className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-2xl font-bold text-transparent dark:from-white dark:to-gray-300">
              {t('login.welcome')}
            </h2>
          )}
          <p className="text-sm text-balance text-muted-foreground">
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
                          <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input
                            className="h-12 bg-white/50 pl-10 transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
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
                            maxLength={MAX_OTP_LENGTH}
                            {...field}
                            disabled={loading}
                            className="justify-center"
                          >
                            <InputOTPGroup className="w-full gap-2">
                              {Array.from({ length: MAX_OTP_LENGTH }).map(
                                (_, i) => (
                                  <InputOTPSlot
                                    key={i}
                                    index={i}
                                    className="h-12 w-full rounded-lg border bg-white/50 text-lg font-semibold transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
                                  />
                                )
                              )}
                            </InputOTPGroup>
                          </InputOTP>
                        </FormControl>
                        <FormDescription className="text-center text-sm text-muted-foreground">
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
                    (otpSent && otpForm.watch('otp').length !== MAX_OTP_LENGTH)
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
                          <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input
                            className="h-12 bg-white/50 pl-10 transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
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
                          <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input
                            className="h-12 bg-white/50 pr-12 pl-10 transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('login.password_placeholder')}
                            {...field}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-primary"
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
                    className="text-sm text-primary transition-colors duration-200 hover:text-primary/80"
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
                <span className="rounded-full border bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/80">
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

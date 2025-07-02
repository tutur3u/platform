'use client';

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
import { type FieldValues, useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Eye, EyeOff, Lock, Mail } from '@tuturuuu/ui/icons';
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

  // Helper function to process email input
  const processEmailInput = (value: string): string => {
    const trimmedValue = value.trim();
    // If the input contains @ symbol, return as is
    if (trimmedValue.includes('@')) {
      return trimmedValue;
    }
    // If it's just a username, append @tuturuuu.com
    if (trimmedValue.length > 0) {
      return `${trimmedValue}@tuturuuu.com`;
    }
    return trimmedValue;
  };

  // Enhanced email input change handler
  const handleEmailChange = (
    value: string,
    formType: 'otp' | 'password',
    field: FieldValues
  ) => {
    setEmailDisplay((prev) => ({ ...prev, [formType]: value }));

    // Reset domain preview when user is typing
    setShowDomainPreview((prev) => ({ ...prev, [formType]: false }));

    // Always use the raw input value while typing
    field.onChange(value);
  };

  // Handle blur event to show domain completion
  const handleEmailBlur = (
    value: string,
    formType: 'otp' | 'password',
    field: FieldValues
  ) => {
    // If value doesn't contain @ and is not empty, show domain preview
    if (value.trim() && !value.includes('@')) {
      setShowDomainPreview((prev) => ({ ...prev, [formType]: true }));
    }

    field.onBlur();
  };

  // Schema Definitions
  const passwordFormSchema = z.object({
    email: z.string().transform(processEmailInput).pipe(z.string().email()),
    password: z.string().min(8, t('login.password_min_length')),
  });

  const OTPFormSchema = z.object({
    email: z.string().transform(processEmailInput).pipe(z.string().email()),
    otp: z.string(),
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

  // State Management
  const passwordless = searchParams.get('passwordless') !== 'false';
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loginMethod, setLoginMethod] = useState<'passwordless' | 'password'>(
    passwordless ? 'passwordless' : 'password'
  );
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailDisplay, setEmailDisplay] = useState({
    otp: DEV_MODE ? 'local@tuturuuu.com' : '',
    password: DEV_MODE ? 'local@tuturuuu.com' : '',
  });
  const [showDomainPreview, setShowDomainPreview] = useState({
    otp: false,
    password: false,
  });

  const processNextUrl = useCallback(async () => {
    const nextUrl = searchParams.get('nextUrl');

    if (nextUrl) {
      router.push(nextUrl);
    } else {
      router.push('/');
    }

    router.refresh();
  }, [searchParams, router]);

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
        window.open(window.location.origin.replace('7806', '8004'), '_blank');
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

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();

    const nextUrl = searchParams.get('nextUrl');
    let redirectURL = `${window.location.origin}/${locale}/login`;
    const searchParamsArray = [];

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
  }, [supabase.auth.getUser]);

  useEffect(() => {
    const processUrl = async () => {
      if (user) await processNextUrl();
    };

    if (initialized) processUrl();
  }, [user, initialized, processNextUrl]);

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
  if (!initialized) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  // Main Login Form
  return (
    <Card className="overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl">
      <CardContent className="space-y-6 p-8">
        <div className="space-y-2 text-center">
          {isExternal && (
            <h2 className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text font-bold text-2xl text-transparent dark:from-white dark:to-gray-300">
              {t('login.welcome')}
            </h2>
          )}
          <p className="text-balance text-muted-foreground text-sm">
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
                      <FormLabel className="font-medium text-gray-700 text-sm dark:text-gray-300">
                        {t('login.email')}
                      </FormLabel>
                      <FormControl>
                        <div className="group relative">
                          <Mail className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input
                            className={`h-12 bg-white/50 pl-10 transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50 ${
                              showDomainPreview.otp &&
                              emailDisplay.otp &&
                              !emailDisplay.otp.includes('@')
                                ? 'pr-32'
                                : ''
                            }`}
                            placeholder={t('login.email_username_placeholder')}
                            value={emailDisplay.otp}
                            onChange={(e) =>
                              handleEmailChange(e.target.value, 'otp', field)
                            }
                            onBlur={() =>
                              handleEmailBlur(emailDisplay.otp, 'otp', field)
                            }
                            disabled={otpSent || loading}
                          />
                          {showDomainPreview.otp &&
                            emailDisplay.otp &&
                            !emailDisplay.otp.includes('@') && (
                              <div className="absolute inset-y-0 right-3 flex items-center">
                                <span className="rounded border border-dynamic-blue/30 bg-dynamic-blue/10 px-2 py-1 text-dynamic-blue text-xs">
                                  @tuturuuu.com
                                </span>
                              </div>
                            )}
                        </div>
                      </FormControl>
                      <FormMessage />
                      {showDomainPreview.otp &&
                        emailDisplay.otp &&
                        !emailDisplay.otp.includes('@') && (
                          <p className="mt-1 text-muted-foreground text-xs">
                            {t('login.will_send_to')}:{' '}
                            <span className="font-medium text-dynamic-blue">
                              {emailDisplay.otp}@tuturuuu.com
                            </span>
                          </p>
                        )}
                    </FormItem>
                  )}
                />

                {otpSent && (
                  <FormField
                    control={otpForm.control}
                    name="otp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium text-gray-700 text-sm dark:text-gray-300">
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
                                (_, index) => (
                                  <InputOTPSlot
                                    key={`otp-${index + 1}`}
                                    index={index}
                                    className="h-12 w-full rounded-lg border bg-white/50 font-semibold text-lg transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
                                  />
                                )
                              )}
                            </InputOTPGroup>
                          </InputOTP>
                        </FormControl>
                        <FormDescription className="text-center text-muted-foreground text-sm">
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
                      <FormLabel className="font-medium text-gray-700 text-sm dark:text-gray-300">
                        {t('login.email')}
                      </FormLabel>
                      <FormControl>
                        <div className="group relative">
                          <Mail className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input
                            className={`h-12 bg-white/50 pl-10 transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50 ${
                              showDomainPreview.password &&
                              emailDisplay.password &&
                              !emailDisplay.password.includes('@')
                                ? 'pr-32'
                                : ''
                            }`}
                            placeholder={t('login.email_username_placeholder')}
                            value={emailDisplay.password}
                            onChange={(e) =>
                              handleEmailChange(
                                e.target.value,
                                'password',
                                field
                              )
                            }
                            onBlur={() =>
                              handleEmailBlur(
                                emailDisplay.password,
                                'password',
                                field
                              )
                            }
                            disabled={loading}
                          />
                          {showDomainPreview.password &&
                            emailDisplay.password &&
                            !emailDisplay.password.includes('@') && (
                              <div className="absolute inset-y-0 right-3 flex items-center">
                                <span className="rounded border border-dynamic-blue/30 bg-dynamic-blue/10 px-2 py-1 text-dynamic-blue text-xs">
                                  @tuturuuu.com
                                </span>
                              </div>
                            )}
                        </div>
                      </FormControl>
                      <FormMessage />
                      {showDomainPreview.password &&
                        emailDisplay.password &&
                        !emailDisplay.password.includes('@') && (
                          <p className="mt-1 text-muted-foreground text-xs">
                            {t('login.will_sign_in_as')}:{' '}
                            <span className="font-medium text-dynamic-blue">
                              {emailDisplay.password}@tuturuuu.com
                            </span>
                          </p>
                        )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium text-gray-700 text-sm dark:text-gray-300">
                        {t('login.password')}
                      </FormLabel>
                      <FormControl>
                        <div className="group relative">
                          <Lock className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input
                            className="h-12 bg-white/50 pr-12 pl-10 transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('login.password_placeholder')}
                            {...field}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="-translate-y-1/2 absolute top-1/2 right-3 text-muted-foreground transition-colors duration-200 hover:text-primary"
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
                    className="text-primary text-sm transition-colors duration-200 hover:text-primary/80"
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
                <span className="rounded-full border bg-white/80 px-3 py-1 font-medium text-muted-foreground text-xs backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/80">
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

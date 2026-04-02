'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { generateCrossAppToken, mapUrlToApp } from '@tuturuuu/auth/cross-app';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { resolveTurnstileClientState } from '@tuturuuu/turnstile/client';
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
import { Input } from '@tuturuuu/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as z from 'zod';
import { DEV_MODE } from '@/constants/common';
import {
  type AuthOAuthProvider,
  getAuthOAuthProviderOptions,
} from '@/lib/auth/oauth-providers';
import { passwordLoginAction } from './actions';
import { SocialLoginButton } from './social-login-button';

const CAPTCHA_ERROR_RETRY_DELAY = 3000;

const authStepVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 28 : -28,
    filter: 'blur(6px)',
  }),
  center: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -28 : 28,
    filter: 'blur(6px)',
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 1, 1] as const,
    },
  }),
};

const authContainerTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

type AuthStage = 'identify' | 'password';

function SocialLogoMask({ src, alt }: { src: string; alt: string }) {
  return (
    <span
      aria-label={alt}
      role="img"
      className="block size-5 shrink-0 bg-current transition-transform duration-200 group-hover:scale-110"
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

export default function LoginForm() {
  const supabase = createClient();
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const processEmailInput = useCallback((value: string): string => {
    const trimmedValue = value.trim();

    if (trimmedValue.includes('@')) {
      return trimmedValue;
    }

    if (trimmedValue.length > 0) {
      return `${trimmedValue}@tuturuuu.com`;
    }

    return trimmedValue;
  }, []);

  const emailSchema = z.string().transform(processEmailInput).pipe(z.email());

  const emailFormSchema = z.object({
    email: emailSchema,
  });

  const passwordFormSchema = z.object({
    email: emailSchema,
    password: z.string().min(8, t('login.password_min_length')),
  });

  const totpFormSchema = z.object({
    totp: z.string().length(6, 'TOTP code must be 6 digits'),
  });

  const defaultEmail = DEV_MODE ? 'local@tuturuuu.com' : '';
  const defaultPassword = DEV_MODE ? 'password123' : '';

  const emailForm = useForm({
    mode: 'onChange',
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: defaultEmail,
    },
  });

  const passwordForm = useForm({
    mode: 'onChange',
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      email: defaultEmail,
      password: defaultPassword,
    },
  });

  const totpForm = useForm({
    mode: 'onChange',
    resolver: zodResolver(totpFormSchema),
    defaultValues: {
      totp: '',
    },
  });

  const [initialized, setInitialized] = useState(false);
  const [readyForAuth, setReadyForAuth] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [requiresMFA, setRequiresMFA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authStage, setAuthStage] = useState<AuthStage>('identify');
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const [showDomainPreview, setShowDomainPreview] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaError, setCaptchaError] = useState<string>();
  const oauthErrorToastKeyRef = useRef<string | null>(null);
  const captchaRefPassword = useRef<TurnstileInstance>(null);

  const turnstileClientState = resolveTurnstileClientState({
    devMode: DEV_MODE,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  const turnstileSiteKey = turnstileClientState.siteKey;
  const emailValue = emailForm.watch('email');
  const normalizedPreviewEmail =
    showDomainPreview && emailValue.trim() && !emailValue.includes('@')
      ? `${emailValue.trim()}@tuturuuu.com`
      : null;
  const emailIsValid = emailSchema.safeParse(emailValue).success;
  const isCaptchaBlockingPasswordSubmit =
    turnstileClientState.isRequired &&
    (!turnstileClientState.canRenderWidget ||
      !turnstileSiteKey ||
      !captchaToken);

  const resetCaptcha = useCallback(() => {
    captchaRefPassword.current?.reset();
    setCaptchaToken(undefined);
  }, []);

  const handleCaptchaError = useCallback(
    (errorCode?: string) => {
      console.error('[Turnstile] Error:', errorCode);
      resetCaptcha();
      setCaptchaError(t('login.captcha_error'));

      window.setTimeout(() => {
        resetCaptcha();
        setCaptchaError(undefined);
      }, CAPTCHA_ERROR_RETRY_DELAY);
    },
    [resetCaptcha, t]
  );

  const handleCaptchaTimeout = useCallback(() => {
    console.warn('[Turnstile] Timeout - resetting widget');
    resetCaptcha();
  }, [resetCaptcha]);

  const needsMFA = useCallback(async () => {
    const { data: assuranceLevel } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    return (
      assuranceLevel?.currentLevel === 'aal1' &&
      assuranceLevel?.nextLevel === 'aal2'
    );
  }, [supabase.auth.mfa]);

  const processNextUrl = useCallback(async () => {
    const returnUrl = searchParams.get('returnUrl');
    const multiAccount = searchParams.get('multiAccount');

    if (multiAccount === 'true') {
      const addAccountUrl = `/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      window.location.href = addAccountUrl;
      return;
    }

    if (returnUrl) {
      const isRelativePath = returnUrl.startsWith('/');
      const returnApp = isRelativePath ? 'web' : mapUrlToApp(returnUrl);

      if (!returnApp) throw new Error('Invalid returnUrl');

      if (returnApp === 'web' || returnApp === 'platform') {
        const redirectUrl = new URL(returnUrl, window.location.origin);
        router.push(redirectUrl.pathname + redirectUrl.search);
        router.refresh();
        return;
      }

      const token = await generateCrossAppToken(supabase, returnApp, 'web');
      await supabase.auth.refreshSession();

      if (!token) {
        throw new Error('Failed to generate token');
      }

      const nextUrl = new URL(decodeURIComponent(returnUrl));
      nextUrl.searchParams.set('token', token);
      nextUrl.searchParams.set('originApp', 'web');
      nextUrl.searchParams.set('targetApp', returnApp);

      if (multiAccount === 'true') {
        nextUrl.searchParams.set('multiAccount', 'true');
      }

      if (nextUrl.origin !== window.location.origin) {
        window.location.assign(nextUrl.toString());
      } else {
        router.push(nextUrl.toString());
        router.refresh();
      }

      return;
    }

    const nextUrl = searchParams.get('nextUrl');

    if (nextUrl) {
      router.push(nextUrl);
    } else {
      router.push('/');
    }

    router.refresh();
  }, [router, searchParams, supabase]);

  const loginWithPassword = async (data: {
    email: string;
    password: string;
  }) => {
    if (!locale || !data.email || !data.password) return;

    setLoading(true);

    try {
      const result = await passwordLoginAction({
        email: data.email,
        password: data.password,
        locale,
        captchaToken,
      });

      resetCaptcha();

      if (result.error) {
        const errorMessage = result.retryAfter
          ? `${result.error} (retry in ${result.retryAfter}s)`
          : result.error;

        passwordForm.setError('password', {
          message: errorMessage,
        });

        toast.error(t('login.failed'), {
          description: errorMessage,
        });

        setLoading(false);
        return;
      }

      router.refresh();

      if (await needsMFA()) {
        setRequiresMFA(true);
        setLoading(false);
        return;
      }

      const multiAccount = searchParams.get('multiAccount');
      const returnUrl = searchParams.get('returnUrl');

      if (multiAccount === 'true' || returnUrl) {
        try {
          await processNextUrl();
        } catch (navError) {
          console.error(
            '[loginWithPassword] Navigation error after successful login:',
            navError
          );

          if (multiAccount === 'true') {
            window.location.href = `/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
          } else {
            window.location.href = '/';
          }
        }
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('[loginWithPassword] Unexpected error:', error);
      resetCaptcha();

      passwordForm.setError('password', {
        message: t('login.invalid_credentials'),
      });

      toast.error(t('login.failed'), {
        description: t('login.invalid_credentials'),
      });

      setLoading(false);
    }
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
      let lastError: Error | null = null;

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
          lastError = error as Error;
        }
      }

      if (!verificationSuccess) {
        throw lastError || new Error('Verification failed for all factors');
      }

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

      toast.error(t('login.failed'), {
        description: t('login.invalid_verification_code'),
      });
    }
  };

  const buildOAuthRedirectUrl = useCallback(() => {
    const returnUrl = searchParams.get('returnUrl');
    const nextUrl = searchParams.get('nextUrl');
    const multiAccount = searchParams.get('multiAccount');
    let redirectURL = `${window.location.origin}/login`;
    const searchParamsArray = [];

    if (returnUrl) {
      searchParamsArray.push(`returnUrl=${encodeURIComponent(returnUrl)}`);
    }

    if (nextUrl) {
      searchParamsArray.push(`nextUrl=${encodeURIComponent(nextUrl)}`);
    }

    if (multiAccount === 'true') {
      searchParamsArray.push('multiAccount=true');
    }

    if (searchParamsArray.length > 0) {
      redirectURL += `?${searchParamsArray.join('&')}`;
    }

    return redirectURL;
  }, [searchParams]);

  const handleOAuthLogin = async (provider: AuthOAuthProvider) => {
    setLoading(true);

    const redirectURL = buildOAuthRedirectUrl();
    const providerOptions = getAuthOAuthProviderOptions(provider);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectURL,
        queryParams: providerOptions.queryParams,
        scopes: providerOptions.scopes,
      },
    });

    if (error) {
      setLoading(false);
      console.error(`Error signing in with ${provider}:`, error);

      toast.error(t('login.failed'), {
        description: t('login.social_sign_in_failed'),
      });
    }
  };

  const advanceToPasswordStage = async () => {
    const isValid = await emailForm.trigger('email');

    if (!isValid) return;

    const normalizedEmail = emailSchema.parse(emailForm.getValues('email'));

    emailForm.setValue('email', normalizedEmail, { shouldValidate: true });
    passwordForm.reset({
      email: normalizedEmail,
      password: defaultPassword,
    });
    setTransitionDirection(1);
    setShowDomainPreview(false);
    setShowPassword(false);
    setCaptchaError(undefined);
    resetCaptcha();
    setAuthStage('password');
  };

  const returnToIdentifyStage = () => {
    const currentEmail = emailForm.getValues('email');

    emailForm.setValue('email', currentEmail, { shouldValidate: true });
    passwordForm.reset({
      email: currentEmail,
      password: defaultPassword,
    });

    setLoading(false);
    setTransitionDirection(-1);
    setShowPassword(false);
    setShowDomainPreview(false);
    setCaptchaError(undefined);
    resetCaptcha();
    setAuthStage('identify');
  };

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);

      if (user) {
        setRequiresMFA(await needsMFA());
      } else {
        setRequiresMFA(false);
      }

      setInitialized(true);
    }

    void checkUser();
  }, [needsMFA, supabase.auth]);

  useEffect(() => {
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (!error && !errorDescription) {
      oauthErrorToastKeyRef.current = null;
      return;
    }

    const toastKey = `${error ?? ''}:${errorDescription ?? ''}`;
    if (oauthErrorToastKeyRef.current === toastKey) {
      return;
    }

    oauthErrorToastKeyRef.current = toastKey;
    setLoading(false);

    toast.error(t('login.failed'), {
      description:
        errorDescription ||
        (error === 'auth_failed'
          ? t('login.oauth_callback_failed')
          : t('login.social_sign_in_failed')),
    });
  }, [searchParams, t]);

  useEffect(() => {
    const processUrl = async () => {
      const multiAccount = searchParams.get('multiAccount');

      if (multiAccount === 'true') {
        setReadyForAuth(true);
        return;
      }

      if (user && !requiresMFA) {
        await processNextUrl();
      } else {
        setReadyForAuth(true);
      }
    };

    if (initialized) {
      void processUrl();
    }
  }, [initialized, processNextUrl, requiresMFA, searchParams, user]);

  useEffect(() => {
    if (!initialized || !readyForAuth || requiresMFA) {
      return;
    }

    if (authStage === 'password') {
      passwordForm.setFocus('password');
      return;
    }

    emailForm.setFocus('email');
  }, [
    authStage,
    emailForm,
    initialized,
    passwordForm,
    readyForAuth,
    requiresMFA,
  ]);

  if (!initialized || !readyForAuth) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  if (requiresMFA) {
    return (
      <motion.div layout transition={authContainerTransition}>
        <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="space-y-2 text-center">
              <h2 className="font-semibold text-2xl tracking-tight">
                {t('login.two_factor_authentication')}
              </h2>
              <p className="text-balance text-muted-foreground text-sm">
                {t('login.enter_authenticator_code')}
              </p>
            </div>

            <Form {...totpForm}>
              <form
                onSubmit={totpForm.handleSubmit(verifyTOtp)}
                className="space-y-6"
              >
                <FormField
                  control={totpForm.control}
                  name="totp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium text-sm">
                        {t('login.verification_code_label')}
                      </FormLabel>
                      <FormControl>
                        <InputOTP
                          maxLength={6}
                          {...field}
                          disabled={loading}
                          className="justify-center"
                        >
                          <InputOTPGroup className="w-full gap-2">
                            {Array.from({ length: 6 }).map((_, index) => (
                              <InputOTPSlot
                                key={`totp-${index + 1}`}
                                index={index}
                                className="h-12 w-full rounded-2xl border border-border/60 bg-background/70 font-semibold text-lg shadow-sm transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                  className="h-12 w-full rounded-2xl font-medium shadow-lg"
                  disabled={loading || totpForm.watch('totp').length !== 6}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <LoadingIndicator className="h-4 w-4" />
                      <span>{t('common.loading')}...</span>
                    </div>
                  ) : (
                    t('login.verify_button')
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div layout transition={authContainerTransition}>
      <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
        <CardContent className="p-6 sm:p-8">
          <motion.div layout transition={{ duration: 0.22, ease: 'easeOut' }}>
            <AnimatePresence
              initial={false}
              mode="wait"
              custom={transitionDirection}
            >
              {authStage === 'identify' ? (
                <motion.div
                  key="identify-auth"
                  custom={transitionDirection}
                  variants={authStepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-6"
                >
                  <Form {...emailForm}>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void advanceToPasswordStage();
                      }}
                      className="space-y-5"
                    >
                      <FormField
                        control={emailForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-sm">
                              {t('login.email')}
                            </FormLabel>
                            <FormControl>
                              <div className="group relative">
                                <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                                <Input
                                  className={`h-12 rounded-2xl border-border/60 bg-background pl-10 shadow-sm transition-all duration-200 focus:border-primary/40 focus:ring-primary/15 ${
                                    normalizedPreviewEmail ? 'pr-32' : ''
                                  }`}
                                  placeholder={t(
                                    'login.email_username_placeholder'
                                  )}
                                  value={field.value}
                                  onChange={(event) => {
                                    setShowDomainPreview(false);
                                    field.onChange(event.target.value);
                                    passwordForm.setValue(
                                      'email',
                                      event.target.value,
                                      { shouldDirty: true }
                                    );
                                  }}
                                  onBlur={() => {
                                    if (
                                      field.value.trim() &&
                                      !field.value.includes('@')
                                    ) {
                                      setShowDomainPreview(true);
                                    }
                                    field.onBlur();
                                  }}
                                  disabled={loading}
                                />
                                {normalizedPreviewEmail ? (
                                  <div className="absolute inset-y-0 right-3 flex items-center">
                                    <span className="rounded-full border border-dynamic-blue/25 bg-dynamic-blue/10 px-2.5 py-1 font-medium text-[11px] text-dynamic-blue">
                                      @tuturuuu.com
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            </FormControl>
                            <FormMessage />
                            {normalizedPreviewEmail ? (
                              <FormDescription className="text-xs">
                                {t('login.will_sign_in_as')}{' '}
                                <span className="font-medium text-foreground">
                                  {normalizedPreviewEmail}
                                </span>
                              </FormDescription>
                            ) : null}
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        className="h-12 w-full rounded-2xl font-medium shadow-lg"
                        disabled={loading || !emailIsValid}
                      >
                        {loading ? (
                          <div className="flex items-center gap-2">
                            <LoadingIndicator className="h-4 w-4" />
                            <span>{t('common.loading')}...</span>
                          </div>
                        ) : (
                          t('login.continue')
                        )}
                      </Button>
                    </form>
                  </Form>

                  <div className="relative py-0.5">
                    <Separator className="bg-border/60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-background px-3 text-muted-foreground text-xs">
                        {t('login.or')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <SocialLoginButton
                      disabled={loading}
                      onClick={() => void handleOAuthLogin('google')}
                      icon={
                        <Image
                          src="/media/google-logo.png"
                          alt="Google"
                          width={20}
                          height={20}
                          className="object-contain transition-transform duration-200 group-hover:scale-110"
                        />
                      }
                    >
                      {t('login.continue_with_google')}
                    </SocialLoginButton>

                    <SocialLoginButton
                      disabled={loading}
                      onClick={() => void handleOAuthLogin('azure')}
                      icon={
                        <Image
                          src="/media/logos/microsoft.svg"
                          alt="Microsoft"
                          width={20}
                          height={20}
                          className="object-contain transition-transform duration-200 group-hover:scale-110"
                        />
                      }
                    >
                      {t('login.continue_with_microsoft')}
                    </SocialLoginButton>

                    <SocialLoginButton
                      disabled={loading}
                      onClick={() => void handleOAuthLogin('apple')}
                      icon={
                        <SocialLogoMask
                          src="/media/logos/apple.svg"
                          alt="Apple"
                        />
                      }
                    >
                      {t('login.continue_with_apple')}
                    </SocialLoginButton>

                    <SocialLoginButton
                      disabled={loading}
                      onClick={() => void handleOAuthLogin('github')}
                      icon={
                        <SocialLogoMask
                          src="/media/logos/github.svg"
                          alt="GitHub"
                        />
                      }
                    >
                      {t('login.continue_with_github')}
                    </SocialLoginButton>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="password-auth"
                  custom={transitionDirection}
                  variants={authStepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-6"
                >
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 w-fit rounded-full px-2.5 text-muted-foreground hover:text-foreground"
                      onClick={returnToIdentifyStage}
                      disabled={loading}
                    >
                      <ArrowLeft className="size-4" />
                      <span>{t('common.back')}</span>
                    </Button>
                  </div>

                  <Form {...passwordForm}>
                    <form
                      onSubmit={passwordForm.handleSubmit(loginWithPassword)}
                      className="space-y-5"
                    >
                      <FormItem>
                        <FormLabel className="font-medium text-sm">
                          {t('login.email')}
                        </FormLabel>
                        <FormControl>
                          <div className="group relative">
                            <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="h-12 rounded-2xl border-border/60 bg-muted/30 pl-10 font-medium text-foreground shadow-none"
                              value={passwordForm.getValues('email')}
                              disabled
                            />
                          </div>
                        </FormControl>
                      </FormItem>

                      <FormField
                        control={passwordForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-sm">
                              {t('login.password')}
                            </FormLabel>
                            <FormControl>
                              <div className="group relative">
                                <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                                <Input
                                  className="h-12 rounded-2xl border-border/60 bg-background pr-12 pl-10 shadow-sm transition-all duration-200 focus:border-primary/40 focus:ring-primary/15"
                                  type={showPassword ? 'text' : 'password'}
                                  placeholder={t('login.password_placeholder')}
                                  {...field}
                                  disabled={loading}
                                />
                                <button
                                  type="button"
                                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                  onClick={() =>
                                    setShowPassword((prev) => !prev)
                                  }
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

                      {turnstileClientState.isRequired ? (
                        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                          {turnstileClientState.canRenderWidget &&
                          turnstileSiteKey ? (
                            <div className="flex flex-col items-center gap-2">
                              <Turnstile
                                ref={captchaRefPassword}
                                siteKey={turnstileSiteKey}
                                onSuccess={(token) => {
                                  setCaptchaToken(token);
                                  setCaptchaError(undefined);
                                }}
                                onExpire={() => setCaptchaToken(undefined)}
                                onError={handleCaptchaError}
                                onTimeout={handleCaptchaTimeout}
                              />
                              {captchaError ? (
                                <p className="text-destructive text-sm">
                                  {captchaError}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-destructive text-sm">
                              {t('login.captcha_not_configured')}
                            </p>
                          )}
                        </div>
                      ) : null}

                      <Button
                        type="submit"
                        className="h-12 w-full rounded-2xl font-medium shadow-lg"
                        disabled={
                          loading ||
                          !passwordForm.formState.isValid ||
                          isCaptchaBlockingPasswordSubmit
                        }
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
                    </form>
                  </Form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

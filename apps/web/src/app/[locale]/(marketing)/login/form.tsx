'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useMutation, useQuery } from '@tanstack/react-query';
import { mapUrlToApp } from '@tuturuuu/auth/cross-app';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  QrCode,
  Smartphone,
} from '@tuturuuu/icons';
import {
  createCrossAppReturnUrlWithInternalApi,
  createMfaMobileApprovalChallengeWithInternalApi,
  getOtpSettings,
  pollMfaMobileApprovalChallengeWithInternalApi,
  type QrLoginSessionPayload,
  sendOtpWithInternalApi,
  verifyOtpWithInternalApi,
} from '@tuturuuu/internal-api/auth';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as z from 'zod';
import { DEV_MODE } from '@/constants/common';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile';
import {
  AUTH_OAUTH_PROVIDERS,
  type AuthOAuthProvider,
  getAuthOAuthProviderOptions,
} from '@/lib/auth/oauth-providers';
import { passwordLoginAction } from './actions';
import { InternalAppAccountConfirmation } from './internal-app-account-confirmation';
import { LoginQrCard } from './login-qr-card';
import { completeVerifiedMfaSignIn } from './mfa-navigation';
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

type AuthStage = 'identify' | 'otp' | 'password' | 'qr';

interface MobileMfaApprovalChallenge {
  expiresAt: string;
  id: string;
  pairCode: string;
  secret: string;
}

function getReturnAppName(returnApp: string | null) {
  if (returnApp === 'learn') return 'Learn';
  if (returnApp === 'tulearn') return 'Learn';
  if (returnApp === 'teach') return 'Teach';
  if (returnApp === 'nova') return 'Nova';
  if (returnApp === 'cms') return 'CMS';
  return returnApp ?? 'the app';
}

function getUserMetadataString(user: SupabaseUser, keys: string[]) {
  for (const key of keys) {
    const value = user.user_metadata?.[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getUserDisplayName(user: SupabaseUser) {
  return getUserMetadataString(user, [
    'display_name',
    'full_name',
    'name',
    'preferred_username',
  ]);
}

function getUserAvatarUrl(user: SupabaseUser) {
  return getUserMetadataString(user, [
    'avatar_url',
    'picture',
    'photo_url',
    'image_url',
  ]);
}

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

function LoginMethodSeparator({ label }: { label: string }) {
  return (
    <div className="relative py-0.5">
      <Separator className="bg-border/60" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bg-background/95 px-3 text-muted-foreground text-xs">
          {label}
        </span>
      </div>
    </div>
  );
}

export default function LoginForm() {
  const supabase = createClient();
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    accounts,
    activeAccountId,
    isInitialized: accountSwitcherInitialized,
    switchAccount,
  } = useAccountSwitcher();
  const returnApp = useMemo(() => {
    const returnUrl = searchParams.get('returnUrl');
    if (!returnUrl) return null;
    return returnUrl.startsWith('/') ? 'web' : mapUrlToApp(returnUrl);
  }, [searchParams]);
  const isInternalAppReturn =
    returnApp !== null && returnApp !== 'web' && returnApp !== 'platform';
  const returnAppName = getReturnAppName(returnApp);

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

  const otpFormSchema = z.object({
    otp: z.string().length(6, t('login.invalid_verification_code')),
  });

  const totpFormSchema = z.object({
    totp: z.string().length(6, t('login.invalid_verification_code')),
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

  const otpForm = useForm({
    mode: 'onChange',
    resolver: zodResolver(otpFormSchema),
    defaultValues: {
      otp: '',
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
  const [otpRetryAfterSeconds, setOtpRetryAfterSeconds] = useState<number>(0);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaError, setCaptchaError] = useState<string>();
  const [mobileMfaChallenge, setMobileMfaChallenge] =
    useState<MobileMfaApprovalChallenge | null>(null);
  const [mobileMfaHandled, setMobileMfaHandled] = useState(false);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(
    null
  );
  const autoOAuthProviderRef = useRef<AuthOAuthProvider | null>(null);
  const oauthErrorToastKeyRef = useRef<string | null>(null);
  const captchaRefPassword = useRef<TurnstileInstance>(null);
  const currentUserProfileQuery = useCurrentUserProfile({
    enabled: Boolean(user && isInternalAppReturn && !requiresMFA),
  });
  const otpSettingsQuery = useQuery({
    queryFn: () => getOtpSettings({ client: 'web' }),
    queryKey: ['auth', 'otp-settings', 'web'],
    retry: 1,
    staleTime: 60_000,
  });

  const turnstileClientState = resolveTurnstileClientState({
    devMode: DEV_MODE,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  const turnstileSiteKey = turnstileClientState.siteKey;
  const emailValue = emailForm.watch('email');
  const otpValue = otpForm.watch('otp');
  const webOtpEnabled = otpSettingsQuery.data?.otpEnabled ?? false;
  const isResolvingOtpEnablement =
    otpSettingsQuery.isLoading && otpSettingsQuery.data === undefined;
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

  const createMobileMfaChallengeMutation = useMutation({
    mutationFn: () =>
      createMfaMobileApprovalChallengeWithInternalApi({
        locale,
      }),
    onError: (error) => {
      toast.error(t('login.mobile_mfa_failed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: (result) => {
      if (result.error || !result.challenge || !result.secret) {
        toast.error(t('login.mobile_mfa_failed'), {
          description: result.error,
        });
        return;
      }

      setMobileMfaHandled(false);
      setMobileMfaChallenge({
        expiresAt: result.challenge.expiresAt,
        id: result.challenge.id,
        pairCode: result.challenge.pairCode,
        secret: result.secret,
      });
    },
  });

  const mobileMfaPollQuery = useQuery({
    enabled: requiresMFA && Boolean(mobileMfaChallenge) && !mobileMfaHandled,
    queryFn: () =>
      pollMfaMobileApprovalChallengeWithInternalApi({
        challengeId: mobileMfaChallenge?.id || '',
        secret: mobileMfaChallenge?.secret || '',
      }),
    queryKey: [
      'auth',
      'mfa-mobile-approval',
      'poll',
      mobileMfaChallenge?.id,
      mobileMfaChallenge?.secret,
    ],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === 'pending') {
        return 2500;
      }
      return false;
    },
    refetchOnWindowFocus: true,
    retry: false,
  });

  const openOtpStage = useCallback(
    ({
      preserveOtpValue = false,
      retryAfterSeconds = 0,
    }: {
      preserveOtpValue?: boolean;
      retryAfterSeconds?: number;
    } = {}) => {
      if (!preserveOtpValue) {
        otpForm.reset({ otp: '' });
      }

      setOtpRetryAfterSeconds(Math.max(0, retryAfterSeconds));
      setTransitionDirection(1);
      setShowDomainPreview(false);
      setAuthStage('otp');
    },
    [otpForm]
  );

  const resetCaptcha = useCallback(() => {
    captchaRefPassword.current?.reset();
    setCaptchaToken(undefined);
  }, []);

  const handleCaptchaSuccess = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaError(undefined);
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

      if (returnApp === 'web' || returnApp === 'platform') {
        const redirectUrl = new URL(returnUrl, window.location.origin);
        router.push(redirectUrl.pathname + redirectUrl.search);
        router.refresh();
        return;
      }

      const { returnUrl: crossAppReturnUrl } =
        await createCrossAppReturnUrlWithInternalApi({ returnUrl });
      await supabase.auth.refreshSession();

      const nextUrl = new URL(crossAppReturnUrl);

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

  const completeMfaSignIn = useCallback(async () => {
    await completeVerifiedMfaSignIn({
      clearMfaRequirement: () => setRequiresMFA(false),
      fallbackToHome: () => {
        window.location.href = '/';
      },
      onNavigationError: (navigationError) => {
        console.error(
          '[login:mfa] Navigation error after successful MFA:',
          navigationError
        );
      },
      onSessionRefreshError: (refreshError) => {
        console.error(
          '[login:mfa] Session refresh failed after successful MFA:',
          refreshError
        );
      },
      processNextUrl,
      refreshSession: () => supabase.auth.refreshSession(),
      resetTotp: () => totpForm.reset({ totp: '' }),
    });
  }, [processNextUrl, supabase.auth, totpForm]);

  const completePrimarySignIn = useCallback(
    async (source: 'otp' | 'password' | 'qr') => {
      router.refresh();

      if (await needsMFA()) {
        setRequiresMFA(true);
        setLoading(false);
        return;
      }

      const multiAccount = searchParams.get('multiAccount');
      const returnUrl = searchParams.get('returnUrl');

      if (returnUrl && isInternalAppReturn) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);
        setReadyForAuth(true);
        setLoading(false);
        return;
      }

      if (multiAccount === 'true' || returnUrl) {
        try {
          await processNextUrl();
        } catch (navError) {
          console.error(
            `[login:${source}] Navigation error after successful login:`,
            navError
          );

          if (multiAccount === 'true') {
            window.location.href = `/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
          } else {
            window.location.href = '/';
          }
        }
        return;
      }

      window.location.reload();
    },
    [
      isInternalAppReturn,
      needsMFA,
      processNextUrl,
      router,
      searchParams,
      supabase.auth,
    ]
  );

  const continueToInternalApp = useCallback(async () => {
    setConfirmingReturn(true);

    try {
      await processNextUrl();
    } catch (error) {
      console.error('[login] Failed to continue to internal app:', error);
      toast.error(t('login.internal_app_continue_failed'));
      setConfirmingReturn(false);
    }
  }, [processNextUrl, t]);

  const switchToStoredAccount = useCallback(
    async (accountId: string) => {
      setSwitchingAccountId(accountId);

      const result = await switchAccount(accountId, {
        targetRoute: `${window.location.pathname}${window.location.search}`,
      });

      if (!result.success) {
        toast.error(t('login.account_switch_failed'), {
          description: result.error,
        });
        setSwitchingAccountId(null);
      }
    },
    [switchAccount, t]
  );

  const handleUseAnotherAccount = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
    setRequiresMFA(false);
    setReadyForAuth(true);
    setLoading(false);
  }, [supabase.auth]);

  const handleQrAuthenticated = useCallback(
    async (session: QrLoginSessionPayload) => {
      setLoading(true);

      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (error) {
        toast.error(t('login.qr_failed_title'), {
          description: error.message,
        });
        setLoading(false);
        return;
      }

      await completePrimarySignIn('qr');
    },
    [completePrimarySignIn, supabase.auth, t]
  );

  const sendOtpMutation = useMutation({
    mutationFn: async (email: string) =>
      sendOtpWithInternalApi({
        captchaToken,
        client: 'web',
        email,
        locale: locale || 'en',
      }),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (otp: string) =>
      verifyOtpWithInternalApi({
        client: 'web',
        email: emailForm.getValues('email'),
        locale: locale || 'en',
        otp,
      }),
  });

  const sendEmailOtp = async () => {
    const isValid = await emailForm.trigger('email');
    if (!isValid || !locale) {
      return;
    }

    const normalizedEmail = emailSchema.parse(emailForm.getValues('email'));
    emailForm.setValue('email', normalizedEmail, { shouldValidate: true });
    passwordForm.setValue('email', normalizedEmail, { shouldDirty: true });

    setLoading(true);

    try {
      const result = await sendOtpMutation.mutateAsync(normalizedEmail);
      resetCaptcha();

      if (result.error) {
        if ((result.retryAfter ?? 0) > 0) {
          openOtpStage({
            preserveOtpValue: authStage === 'otp',
            retryAfterSeconds: result.retryAfter ?? 0,
          });

          toast.warning(t('login.otp_rate_limited_title'), {
            description: t('login.otp_rate_limited_description', {
              seconds: result.retryAfter ?? 0,
            }),
          });
        } else {
          toast.error(t('login.failed_to_send'), {
            description: result.error,
          });
        }

        setLoading(false);
        return;
      }

      openOtpStage();
      setLoading(false);
    } catch (error) {
      resetCaptcha();
      console.error('[sendEmailOtp] Unexpected error:', error);
      toast.error(t('login.failed_to_send'), {
        description: t('login.failed_to_send'),
      });
      setLoading(false);
    }
  };

  const loginWithOtp = async (data: { otp: string }) => {
    if (!locale || !data.otp) return;

    setLoading(true);

    try {
      const result = await verifyOtpMutation.mutateAsync(data.otp);

      if (result.error) {
        otpForm.setError('otp', {
          message: result.error,
        });
        otpForm.setValue('otp', '');
        toast.error(t('login.failed_to_verify'), {
          description: result.error,
        });
        setLoading(false);
        return;
      }

      await completePrimarySignIn('otp');
    } catch (error) {
      console.error('[loginWithOtp] Unexpected error:', error);
      otpForm.setError('otp', {
        message: t('login.invalid_verification_code'),
      });
      otpForm.setValue('otp', '');
      toast.error(t('login.failed_to_verify'), {
        description: t('login.invalid_verification_code'),
      });
      setLoading(false);
    }
  };

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

      await completePrimarySignIn('password');
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

      await completeMfaSignIn();
      setLoading(false);
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

  const handleOAuthLogin = useCallback(
    async (provider: AuthOAuthProvider) => {
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
    },
    [buildOAuthRedirectUrl, supabase.auth, t]
  );

  useEffect(() => {
    if (!initialized || !readyForAuth || requiresMFA || user) {
      return;
    }

    const provider = searchParams.get('provider');
    if (
      !provider ||
      !AUTH_OAUTH_PROVIDERS.includes(provider as AuthOAuthProvider)
    ) {
      autoOAuthProviderRef.current = null;
      return;
    }

    const oauthProvider = provider as AuthOAuthProvider;
    if (autoOAuthProviderRef.current === oauthProvider) {
      return;
    }

    autoOAuthProviderRef.current = oauthProvider;
    void handleOAuthLogin(oauthProvider);
  }, [
    handleOAuthLogin,
    initialized,
    readyForAuth,
    requiresMFA,
    searchParams,
    user,
  ]);

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
    setOtpRetryAfterSeconds(0);
    setCaptchaError(undefined);
    resetCaptcha();
    setAuthStage('password');
  };

  const advanceToQrStage = () => {
    setTransitionDirection(1);
    setShowDomainPreview(false);
    setOtpRetryAfterSeconds(0);
    setCaptchaError(undefined);
    setAuthStage('qr');
  };

  const returnToIdentifyStage = () => {
    const currentEmail = emailForm.getValues('email');

    emailForm.setValue('email', currentEmail, { shouldValidate: true });
    otpForm.reset({ otp: '' });
    passwordForm.reset({
      email: currentEmail,
      password: defaultPassword,
    });

    setLoading(false);
    setTransitionDirection(-1);
    setShowPassword(false);
    setShowDomainPreview(false);
    setOtpRetryAfterSeconds(0);
    setCaptchaError(undefined);
    resetCaptcha();
    setAuthStage('identify');
  };

  useEffect(() => {
    if (otpRetryAfterSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setOtpRetryAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [otpRetryAfterSeconds]);

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
        if (isInternalAppReturn) {
          setReadyForAuth(true);
          return;
        }

        try {
          await processNextUrl();
        } catch (error) {
          console.error(
            '[login] Failed to process authenticated returnUrl navigation:',
            error
          );
          setReadyForAuth(true);
        }
      } else {
        setReadyForAuth(true);
      }
    };

    if (initialized) {
      void processUrl();
    }
  }, [
    initialized,
    isInternalAppReturn,
    processNextUrl,
    requiresMFA,
    searchParams,
    user,
  ]);

  useEffect(() => {
    const result = mobileMfaPollQuery.data;
    if (!requiresMFA || !result || mobileMfaHandled) {
      return;
    }

    if (result.mobileMfaVerified) {
      setMobileMfaHandled(true);
      setLoading(true);
      toast.success(t('login.mobile_mfa_approved'));
      void completeMfaSignIn().finally(() => setLoading(false));
      return;
    }

    if (
      result.error ||
      result.status === 'expired' ||
      result.status === 'rejected' ||
      result.status === 'consumed'
    ) {
      setMobileMfaChallenge(null);
      toast.error(t('login.mobile_mfa_failed'), {
        description: result.error,
      });
    }
  }, [
    completeMfaSignIn,
    mobileMfaHandled,
    mobileMfaPollQuery.data,
    requiresMFA,
    t,
  ]);

  useEffect(() => {
    if (!initialized || !readyForAuth || requiresMFA) {
      return;
    }

    if (authStage === 'otp') {
      otpForm.setFocus('otp');
      return;
    }

    if (authStage === 'password') {
      passwordForm.setFocus('password');
      return;
    }

    if (authStage === 'qr') {
      return;
    }

    emailForm.setFocus('email');
  }, [
    authStage,
    emailForm,
    initialized,
    otpForm,
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

  if (user && !requiresMFA && isInternalAppReturn) {
    const currentUserProfile = currentUserProfileQuery.data;

    return (
      <InternalAppAccountConfirmation
        accounts={accounts}
        activeAccountId={activeAccountId}
        appName={returnAppName}
        confirming={confirmingReturn}
        currentAvatarUrl={
          currentUserProfile?.avatar_url ?? getUserAvatarUrl(user)
        }
        currentDisplayName={
          currentUserProfile?.display_name ??
          currentUserProfile?.full_name ??
          getUserDisplayName(user)
        }
        currentEmail={
          currentUserProfile?.email ?? user.email ?? t('login.unknown_account')
        }
        currentUserId={user.id}
        isAccountSwitcherReady={accountSwitcherInitialized}
        onContinue={() => void continueToInternalApp()}
        onSwitchAccount={(accountId) => void switchToStoredAccount(accountId)}
        onUseAnotherAccount={() => void handleUseAnotherAccount()}
        switchingAccountId={switchingAccountId}
      />
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

            <div className="space-y-4">
              <Separator />

              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Smartphone className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        {t('login.mobile_mfa_title')}
                      </p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {t('login.mobile_mfa_description')}
                      </p>
                    </div>

                    {mobileMfaChallenge ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                          <p className="text-muted-foreground text-xs">
                            {t('login.mobile_mfa_pair_code_label')}
                          </p>
                          <p className="font-mono font-semibold text-2xl tracking-[0.18em]">
                            {mobileMfaChallenge.pairCode}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 rounded-xl"
                            disabled={
                              createMobileMfaChallengeMutation.isPending ||
                              loading
                            }
                            onClick={() =>
                              createMobileMfaChallengeMutation.mutate()
                            }
                          >
                            {createMobileMfaChallengeMutation.isPending ? (
                              <LoadingIndicator className="size-4" />
                            ) : (
                              t('login.mobile_mfa_new_code')
                            )}
                          </Button>
                          <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <LoadingIndicator className="size-3.5" />
                            <span>{t('login.mobile_mfa_waiting')}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 rounded-xl"
                        disabled={
                          createMobileMfaChallengeMutation.isPending || loading
                        }
                        onClick={() =>
                          createMobileMfaChallengeMutation.mutate()
                        }
                      >
                        {createMobileMfaChallengeMutation.isPending ? (
                          <div className="flex items-center gap-2">
                            <LoadingIndicator className="size-4" />
                            <span>{t('common.loading')}...</span>
                          </div>
                        ) : (
                          t('login.mobile_mfa_button')
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
                        if (loading || isResolvingOtpEnablement) {
                          return;
                        }
                        if (webOtpEnabled) {
                          void sendEmailOtp();
                          return;
                        }
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

                      {!isResolvingOtpEnablement &&
                      turnstileClientState.isRequired ? (
                        <div className="rounded-2xl bg-transparent py-1">
                          {turnstileClientState.canRenderWidget &&
                          turnstileSiteKey ? (
                            <div className="flex flex-col items-center gap-2">
                              <Turnstile
                                ref={captchaRefPassword}
                                siteKey={turnstileSiteKey}
                                onSuccess={handleCaptchaSuccess}
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
                          isResolvingOtpEnablement ||
                          loading ||
                          !emailIsValid ||
                          (webOtpEnabled && isCaptchaBlockingPasswordSubmit)
                        }
                      >
                        {loading || isResolvingOtpEnablement ? (
                          <div className="flex items-center gap-2">
                            <LoadingIndicator className="h-4 w-4" />
                            <span>{t('common.loading')}...</span>
                          </div>
                        ) : (
                          t('login.continue_with_email')
                        )}
                      </Button>
                    </form>
                  </Form>

                  <LoginMethodSeparator label={t('login.or')} />

                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full rounded-2xl font-medium"
                    onClick={advanceToQrStage}
                    disabled={loading}
                  >
                    <QrCode className="size-4" />
                    <span>{t('login.qr_title')}</span>
                  </Button>

                  <LoginMethodSeparator label={t('login.or')} />

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
              ) : authStage === 'qr' ? (
                <motion.div
                  key="qr-auth"
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

                  <LoginQrCard
                    canRenderTurnstile={turnstileClientState.canRenderWidget}
                    disabled={loading}
                    locale={locale || 'en'}
                    onAuthenticated={handleQrAuthenticated}
                    requiresTurnstile={turnstileClientState.isRequired}
                    turnstileSiteKey={turnstileSiteKey}
                  />
                </motion.div>
              ) : authStage === 'otp' ? (
                <motion.div
                  key="otp-auth"
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

                  <div className="space-y-2 text-center">
                    <p className="font-medium text-foreground text-sm">
                      {emailForm.getValues('email')}
                    </p>
                    <p className="text-balance text-muted-foreground text-sm">
                      {otpRetryAfterSeconds > 0
                        ? t('login.otp_rate_limited_inline', {
                            seconds: otpRetryAfterSeconds,
                          })
                        : t('login.check_email')}
                    </p>
                  </div>

                  <Form {...otpForm}>
                    <form
                      onSubmit={otpForm.handleSubmit(loginWithOtp)}
                      className="space-y-5"
                    >
                      <FormField
                        control={otpForm.control}
                        name="otp"
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
                                      key={`otp-${index + 1}`}
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
                        disabled={loading || otpValue.length !== 6}
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

                      {turnstileClientState.isRequired ? (
                        <div className="rounded-2xl bg-transparent py-1">
                          {turnstileClientState.canRenderWidget &&
                          turnstileSiteKey ? (
                            <div className="flex flex-col items-center gap-2">
                              <Turnstile
                                ref={captchaRefPassword}
                                siteKey={turnstileSiteKey}
                                onSuccess={handleCaptchaSuccess}
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

                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-2xl"
                          onClick={() => void sendEmailOtp()}
                          disabled={
                            loading ||
                            otpRetryAfterSeconds > 0 ||
                            (turnstileClientState.isRequired &&
                              isCaptchaBlockingPasswordSubmit)
                          }
                        >
                          {otpRetryAfterSeconds > 0
                            ? t('login.resend_available_in', {
                                seconds: otpRetryAfterSeconds,
                              })
                            : t('login.resend')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-2xl"
                          onClick={advanceToPasswordStage}
                          disabled={loading}
                        >
                          {t('login.use_password_instead')}
                        </Button>
                      </div>
                    </form>
                  </Form>
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
                        <div className="rounded-2xl bg-transparent py-1">
                          {turnstileClientState.canRenderWidget &&
                          turnstileSiteKey ? (
                            <div className="flex flex-col items-center gap-2">
                              <Turnstile
                                ref={captchaRefPassword}
                                siteKey={turnstileSiteKey}
                                onSuccess={handleCaptchaSuccess}
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

                      {webOtpEnabled ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 w-full rounded-2xl"
                          onClick={() => void sendEmailOtp()}
                          disabled={loading}
                        >
                          {t('login.use_code_instead')}
                        </Button>
                      ) : null}
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

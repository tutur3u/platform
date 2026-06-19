'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  mapUrlToApp,
  normalizeClientRedirectPath,
} from '@tuturuuu/auth/cross-app';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Smartphone,
} from '@tuturuuu/icons/lucide-static';
import {
  createCrossAppReturnUrlWithInternalApi,
  createMfaMobileApprovalChallengeWithInternalApi,
  getOtpSettings,
  passwordLoginWithInternalApi,
  pollMfaMobileApprovalChallengeWithInternalApi,
  resolveCrossAppReturnUrlWithInternalApi,
  sendOtpWithInternalApi,
  verifyOtpWithInternalApi,
} from '@tuturuuu/internal-api/auth';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { getAppDomainByUrl } from '@tuturuuu/utils/internal-domains';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as z from 'zod';
import { DEV_MODE } from '@/constants/common';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile';
import {
  AUTH_OAUTH_PROVIDERS,
  type AuthOAuthProvider,
  getAuthOAuthProviderOptions,
} from '@/lib/auth/oauth-providers';
import { appendDiagnosticReference } from './auth-diagnostic-copy';
import { resolveAuthRedirectOrigin } from './auth-redirect-origin';
import { InvalidReturnUrlWarning } from './invalid-return-url-warning';
import { completeVerifiedMfaSignIn } from './mfa-navigation';
import { PasskeyLoginButton } from './passkey-login-button';
import { SocialLoginButton } from './social-login-button';
import {
  getTurnstileClientErrorMessageKey,
  resolveLoginTurnstileClientState,
  shouldHonorLocalE2EAuthBypassForLogin,
  shouldRetryTurnstileClientError,
} from './turnstile-state';

const CAPTCHA_ERROR_RETRY_DELAY = 3000;
const INVALID_LOCAL_RETURN_URL = '__invalid_local_return_url__';
const VERIFY_TOKEN_FALLBACK_PATH = '/onboarding';
const VERIFY_TOKEN_ROUTE_SEGMENT = 'verify-token';

const Turnstile = lazy(async () => {
  const { Turnstile: TurnstileComponent } = await import(
    '@marsidev/react-turnstile'
  );

  return { default: TurnstileComponent };
});

const InternalAppAccountConfirmation = lazy(async () => {
  const { InternalAppAccountConfirmation: Confirmation } = await import(
    './internal-app-account-confirmation'
  );

  return { default: Confirmation };
});

const InputOTP = lazy(async () => {
  const { InputOTP: InputOTPComponent } = await import(
    '@tuturuuu/ui/input-otp'
  );

  return { default: InputOTPComponent };
});

const InputOTPGroup = lazy(async () => {
  const { InputOTPGroup: InputOTPGroupComponent } = await import(
    '@tuturuuu/ui/input-otp'
  );

  return { default: InputOTPGroupComponent };
});

const InputOTPSlot = lazy(async () => {
  const { InputOTPSlot: InputOTPSlotComponent } = await import(
    '@tuturuuu/ui/input-otp'
  );

  return { default: InputOTPSlotComponent };
});

function TurnstileLoadingFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-[65px] w-[300px] max-w-full animate-pulse rounded-xl bg-muted/50"
    />
  );
}

function InputOTPRowFallback() {
  return (
    <div className="flex w-full justify-center gap-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          aria-hidden="true"
          className="h-12 w-full animate-pulse rounded-2xl border border-border/60 bg-muted/50"
          key={`otp-fallback-${index + 1}`}
        />
      ))}
    </div>
  );
}

function InternalAppAccountConfirmationFallback() {
  return (
    <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <LoadingIndicator className="size-6" />
      </CardContent>
    </Card>
  );
}

function getSafeLocalReturnPath(returnUrl: string | null | undefined) {
  const normalizedReturnUrl = normalizeClientRedirectPath(
    returnUrl,
    INVALID_LOCAL_RETURN_URL
  );

  return normalizedReturnUrl === INVALID_LOCAL_RETURN_URL
    ? null
    : normalizedReturnUrl;
}

function getPlatformVerifyTokenNextPath(redirectUrl: URL) {
  const pathSegments = redirectUrl.pathname.split('/').filter(Boolean);

  if (pathSegments[pathSegments.length - 1] !== VERIFY_TOKEN_ROUTE_SEGMENT) {
    return null;
  }

  return normalizeClientRedirectPath(
    redirectUrl.searchParams.get('nextUrl'),
    VERIFY_TOKEN_FALLBACK_PATH
  );
}

type AuthStage = 'identify' | 'otp' | 'password';

interface MobileMfaApprovalChallenge {
  expiresAt: string;
  id: string;
  pairCode: string;
  secret: string;
}

interface ReturnUrlValidationFailure {
  reason?: string;
  returnUrl: string;
}

function getReturnAppName(returnApp: string | null) {
  if (returnApp === 'learn') return 'Learn';
  if (returnApp === 'tulearn') return 'Learn';
  if (returnApp === 'teach') return 'Teach';
  if (returnApp === 'chat') return 'Chat';
  if (returnApp === 'nova') return 'Nova';
  if (returnApp === 'cms') return 'CMS';
  if (returnApp === 'inventory') return 'Inventory';
  return returnApp ?? 'the app';
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

type LoginFormProps = {
  localE2EAuthBypass?: boolean;
  runtimeSupabaseConfig?: {
    supabasePublishableKey: string;
    supabaseUrl: string;
  } | null;
};

export default function LoginForm({
  localE2EAuthBypass: runtimeLocalE2EAuthBypass = false,
  runtimeSupabaseConfig = null,
}: LoginFormProps) {
  const supabase = useMemo(
    () => createAuthClient(runtimeSupabaseConfig ?? undefined),
    [runtimeSupabaseConfig]
  );
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
  const returnUrl = searchParams.get('returnUrl');
  const localReturnPath = useMemo(
    () => getSafeLocalReturnPath(returnUrl),
    [returnUrl]
  );
  const staticReturnApp = useMemo(() => {
    if (!returnUrl) return null;
    return localReturnPath ? 'web' : mapUrlToApp(returnUrl);
  }, [localReturnPath, returnUrl]);
  const shouldResolveReturnApp = Boolean(
    returnUrl && !localReturnPath && !staticReturnApp
  );
  const {
    data: resolvedReturnApp,
    error: resolvedReturnAppError,
    isError: didFailToResolveReturnApp,
    isLoading: isResolvingConfiguredReturnApp,
    refetch: refetchResolvedReturnApp,
  } = useQuery({
    enabled: shouldResolveReturnApp,
    queryFn: async () => {
      const result = await resolveCrossAppReturnUrlWithInternalApi({
        returnUrl: returnUrl ?? '',
      });

      if (!result.targetApp) {
        throw new Error(result.error ?? 'Invalid returnUrl');
      }

      return result;
    },
    queryKey: ['auth', 'cross-app-return', returnUrl],
    retry: false,
    staleTime: 60_000,
  });
  const returnApp = staticReturnApp ?? resolvedReturnApp?.targetApp ?? null;
  const isResolvingReturnApp =
    shouldResolveReturnApp && isResolvingConfiguredReturnApp;
  const isInternalAppReturn =
    returnApp !== null && returnApp !== 'web' && returnApp !== 'platform';
  const isRegisteredInternalAppReturn =
    staticReturnApp !== null &&
    staticReturnApp !== 'web' &&
    staticReturnApp !== 'platform';
  const returnAppName =
    resolvedReturnApp?.appName ?? getReturnAppName(returnApp);

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
  const publicLocalE2EAuthBypass =
    process.env.NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS === 'true';
  const browserLocalE2EAuthBypass = shouldHonorLocalE2EAuthBypassForLogin({
    devMode: DEV_MODE,
    publicLocalE2EAuthBypass,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const localE2EAuthBypass =
    runtimeLocalE2EAuthBypass || browserLocalE2EAuthBypass;

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
  const [redirectingAfterAuth, setRedirectingAfterAuth] = useState(false);
  const redirectingAfterAuthRef = useRef(false);
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
  const [passwordRateLimitedEmail, setPasswordRateLimitedEmail] = useState<
    string | null
  >(null);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [returnUrlValidationFailure, setReturnUrlValidationFailure] =
    useState<ReturnUrlValidationFailure | null>(null);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(
    null
  );
  const autoOAuthProviderRef = useRef<AuthOAuthProvider | null>(null);
  const oauthErrorToastKeyRef = useRef<string | null>(null);
  const captchaRefPassword = useRef<TurnstileInstance>(null);
  const currentUserProfileQuery = useCurrentUserProfile({
    enabled: Boolean(
      user &&
        isInternalAppReturn &&
        !isRegisteredInternalAppReturn &&
        !requiresMFA
    ),
    userId: user?.id,
  });
  const otpSettingsQuery = useQuery({
    queryFn: () => getOtpSettings({ client: 'web' }),
    queryKey: ['auth', 'otp-settings', 'web'],
    retry: 1,
    staleTime: 60_000,
  });

  const turnstileClientState = resolveLoginTurnstileClientState({
    devMode: DEV_MODE || localE2EAuthBypass,
    localE2EAuthBypass,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const turnstileSiteKey = turnstileClientState.siteKey;
  const emailValue = emailForm.watch('email');
  const passwordEmailValue = passwordForm.watch('email');
  const passwordValue = passwordForm.watch('password');
  const otpValue = otpForm.watch('otp');
  const webOtpEnabled = otpSettingsQuery.data?.otpEnabled ?? false;
  const formatDiagnosticDescription = useCallback(
    (description?: string | null, diagnosticCode?: string | null) =>
      appendDiagnosticReference({
        description,
        diagnosticCode,
        referenceLabel: diagnosticCode
          ? t('login.diagnostic_reference', { code: diagnosticCode })
          : '',
      }),
    [t]
  );
  const isResolvingOtpEnablement =
    otpSettingsQuery.isLoading && otpSettingsQuery.data === undefined;
  const normalizedPreviewEmail =
    showDomainPreview && emailValue.trim() && !emailValue.includes('@')
      ? `${emailValue.trim()}@tuturuuu.com`
      : null;
  const emailIsValid = emailSchema.safeParse(emailValue).success;
  const passwordCredentialsAreValid = passwordFormSchema.safeParse({
    email: passwordEmailValue,
    password: passwordValue,
  }).success;
  const isCaptchaBlockingPasswordSubmit =
    turnstileClientState.isRequired &&
    (!turnstileClientState.canRenderWidget ||
      !turnstileSiteKey ||
      !captchaToken);
  const resolvedReturnUrlFailure =
    shouldResolveReturnApp && didFailToResolveReturnApp && returnUrl
      ? {
          reason:
            resolvedReturnAppError instanceof Error
              ? resolvedReturnAppError.message
              : undefined,
          returnUrl,
        }
      : null;
  const activeReturnUrlFailure =
    returnUrlValidationFailure?.returnUrl === returnUrl
      ? returnUrlValidationFailure
      : resolvedReturnUrlFailure;
  const hasActiveReturnUrlFailure = Boolean(activeReturnUrlFailure);
  const canRenderAuthSurface = readyForAuth || !initialized;
  const authStageTransitionClassName = `space-y-6 animate-in fade-in-0 duration-200 ${
    transitionDirection > 0 ? 'slide-in-from-right-4' : 'slide-in-from-left-4'
  }`;

  const setRedirectingAfterAuthState = useCallback((value: boolean) => {
    redirectingAfterAuthRef.current = value;
    setRedirectingAfterAuth(value);
  }, []);

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

  const openPasswordStage = useCallback(
    (normalizedEmail: string) => {
      passwordForm.reset({
        email: normalizedEmail,
        password: defaultPassword,
      });
      setTransitionDirection(1);
      setShowDomainPreview(false);
      setShowPassword(false);
      setOtpRetryAfterSeconds(0);
      setCaptchaError(undefined);
      setPasswordRateLimitedEmail(null);
      resetCaptcha();
      setAuthStage('password');
    },
    [defaultPassword, passwordForm, resetCaptcha]
  );

  const markReturnUrlValidationFailure = useCallback(
    (failedReturnUrl: string, error?: unknown) => {
      setRedirectingAfterAuthState(false);
      setReturnUrlValidationFailure({
        reason: error instanceof Error ? error.message : undefined,
        returnUrl: failedReturnUrl,
      });
      setConfirmingReturn(false);
      setLoading(false);
      setReadyForAuth(true);
    },
    [setRedirectingAfterAuthState]
  );

  const showRedirectingAfterAuth = useCallback(() => {
    setConfirmingReturn(false);
    setReadyForAuth(true);
    setRedirectingAfterAuthState(true);
  }, [setRedirectingAfterAuthState]);

  const handleCaptchaSuccess = useCallback(
    (token: string) => {
      setCaptchaToken(token);
      setCaptchaError(undefined);
      setPasswordRateLimitedEmail(null);
      passwordForm.clearErrors('password');
    },
    [passwordForm]
  );

  const handleCaptchaError = useCallback(
    (errorCode?: string) => {
      console.warn('[Turnstile] Error:', errorCode);
      resetCaptcha();
      setPasswordRateLimitedEmail(null);
      passwordForm.clearErrors('password');
      setCaptchaError(
        t(`login.${getTurnstileClientErrorMessageKey(errorCode)}`)
      );

      if (shouldRetryTurnstileClientError(errorCode)) {
        window.setTimeout(() => {
          resetCaptcha();
          setCaptchaError(undefined);
        }, CAPTCHA_ERROR_RETRY_DELAY);
      }
    },
    [passwordForm, resetCaptcha, t]
  );

  const handleCaptchaTimeout = useCallback(() => {
    console.warn('[Turnstile] Timeout - resetting widget');
    resetCaptcha();
  }, [resetCaptcha]);

  const renderTurnstile = (siteKey: string) => (
    <Suspense fallback={<TurnstileLoadingFallback />}>
      <Turnstile
        ref={captchaRefPassword}
        siteKey={siteKey}
        onSuccess={handleCaptchaSuccess}
        onExpire={() => setCaptchaToken(undefined)}
        onError={handleCaptchaError}
        onTimeout={handleCaptchaTimeout}
      />
    </Suspense>
  );

  const needsMFA = useCallback(async () => {
    const { data: assuranceLevel } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    return (
      assuranceLevel?.currentLevel === 'aal1' &&
      assuranceLevel?.nextLevel === 'aal2'
    );
  }, [supabase.auth.mfa]);

  const prepareReturnAppConfirmation = useCallback(async () => {
    const returnUrl = searchParams.get('returnUrl');

    if (!returnUrl || getSafeLocalReturnPath(returnUrl)) {
      return false;
    }

    let resolvedReturnApp = returnApp;

    if (!resolvedReturnApp && shouldResolveReturnApp) {
      const refetchResult = await refetchResolvedReturnApp();

      if (refetchResult.error) {
        markReturnUrlValidationFailure(returnUrl, refetchResult.error);
        return true;
      }

      resolvedReturnApp = refetchResult.data?.targetApp ?? null;
    }

    if (!resolvedReturnApp) {
      markReturnUrlValidationFailure(returnUrl);
      return true;
    }

    if (isRegisteredInternalAppReturn) {
      return false;
    }

    if (!resolvedReturnApp || ['platform', 'web'].includes(resolvedReturnApp)) {
      return false;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    setRedirectingAfterAuthState(false);
    setUser(user);
    setReadyForAuth(true);
    setLoading(false);
    return true;
  }, [
    markReturnUrlValidationFailure,
    setRedirectingAfterAuthState,
    isRegisteredInternalAppReturn,
    refetchResolvedReturnApp,
    returnApp,
    searchParams,
    shouldResolveReturnApp,
    supabase.auth,
  ]);

  const processNextUrl = useCallback(async () => {
    const returnUrl = searchParams.get('returnUrl');
    const multiAccount = searchParams.get('multiAccount');

    if (multiAccount === 'true') {
      const addAccountUrl = `/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
      window.location.href = addAccountUrl;
      return;
    }

    if (returnUrl) {
      const localReturnPath = getSafeLocalReturnPath(returnUrl);
      const returnApp = localReturnPath ? 'web' : mapUrlToApp(returnUrl);

      if (returnApp === 'web' || returnApp === 'platform') {
        if (localReturnPath) {
          router.push(localReturnPath);
          router.refresh();
          return;
        }

        const canonicalReturnUrl =
          getAppDomainByUrl(returnUrl)?.canonicalUrl ?? returnUrl;
        const redirectUrl = new URL(canonicalReturnUrl);
        const verifyTokenNextPath = getPlatformVerifyTokenNextPath(redirectUrl);

        if (verifyTokenNextPath) {
          window.location.replace(verifyTokenNextPath);
          return;
        }

        window.location.assign(redirectUrl.toString());
        return;
      }

      const crossAppReturn = await createCrossAppReturnUrlWithInternalApi({
        returnUrl,
      });

      if (!crossAppReturn.returnUrl || !crossAppReturn.targetApp) {
        throw new Error(crossAppReturn.error ?? 'Invalid returnUrl');
      }

      await supabase.auth.refreshSession();

      const nextUrl = new URL(crossAppReturn.returnUrl);

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
      router.push(normalizeClientRedirectPath(nextUrl));
    } else {
      router.push('/');
    }

    router.refresh();
  }, [router, searchParams, supabase]);

  const completeMfaSignIn = useCallback(async () => {
    showRedirectingAfterAuth();

    await completeVerifiedMfaSignIn({
      clearMfaRequirement: () => setRequiresMFA(false),
      fallbackToHome: () => {
        showRedirectingAfterAuth();
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
      processNextUrl: async () => {
        if (await prepareReturnAppConfirmation()) {
          setRedirectingAfterAuthState(false);
          return;
        }

        await processNextUrl();
      },
      refreshSession: () => supabase.auth.refreshSession(),
      resetTotp: () => totpForm.reset({ totp: '' }),
    });
  }, [
    prepareReturnAppConfirmation,
    processNextUrl,
    setRedirectingAfterAuthState,
    showRedirectingAfterAuth,
    supabase.auth,
    totpForm,
  ]);

  const completePrimarySignIn = useCallback(
    async (source: 'otp' | 'passkey' | 'password') => {
      router.refresh();

      if (await needsMFA()) {
        setRedirectingAfterAuthState(false);
        setRequiresMFA(true);
        setLoading(false);
        return;
      }

      const multiAccount = searchParams.get('multiAccount');
      const returnUrl = searchParams.get('returnUrl');

      if (await prepareReturnAppConfirmation()) {
        setRedirectingAfterAuthState(false);
        return;
      }

      showRedirectingAfterAuth();

      if (multiAccount === 'true' || returnUrl) {
        try {
          await processNextUrl();
        } catch (navError) {
          console.error(
            `[login:${source}] Navigation error after successful login:`,
            navError
          );

          if (returnUrl && !getSafeLocalReturnPath(returnUrl)) {
            markReturnUrlValidationFailure(returnUrl, navError);
            return;
          }

          if (multiAccount === 'true') {
            showRedirectingAfterAuth();
            window.location.href = `/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
          } else {
            showRedirectingAfterAuth();
            window.location.href = '/';
          }
        }
        return;
      }

      try {
        await processNextUrl();
      } catch (navError) {
        console.error(
          `[login:${source}] Navigation error after successful login:`,
          navError
        );
        showRedirectingAfterAuth();
        window.location.href = '/';
      }
    },
    [
      needsMFA,
      markReturnUrlValidationFailure,
      prepareReturnAppConfirmation,
      processNextUrl,
      router,
      searchParams,
      setRedirectingAfterAuthState,
      showRedirectingAfterAuth,
    ]
  );

  const continueToInternalApp = useCallback(async () => {
    setConfirmingReturn(true);

    try {
      await processNextUrl();
    } catch (error) {
      console.error('[login] Failed to continue to internal app:', error);
      const returnUrl = searchParams.get('returnUrl');

      if (returnUrl && !getSafeLocalReturnPath(returnUrl)) {
        markReturnUrlValidationFailure(returnUrl, error);
      }

      toast.error(t('login.internal_app_continue_failed'));
      setConfirmingReturn(false);
    }
  }, [markReturnUrlValidationFailure, processNextUrl, searchParams, t]);

  const switchToStoredAccount = useCallback(
    async (accountId: string) => {
      setSwitchingAccountId(accountId);

      const result = await switchAccount(accountId, {
        targetRoute: `${window.location.pathname}${window.location.search}`,
      });

      if (!result.success) {
        toast.error(t('login.account_switch_failed'), {
          description: formatDiagnosticDescription(
            result.error,
            result.diagnosticCode
          ),
        });
        setSwitchingAccountId(null);
      }
    },
    [formatDiagnosticDescription, switchAccount, t]
  );

  const handleUseAnotherAccount = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
    setRequiresMFA(false);
    setRedirectingAfterAuthState(false);
    setReadyForAuth(true);
    setLoading(false);
  }, [setRedirectingAfterAuthState, supabase.auth]);

  const clearInvalidReturnUrl = useCallback(() => {
    setReturnUrlValidationFailure(null);
    setConfirmingReturn(false);
    setRedirectingAfterAuthState(false);
    setLoading(false);

    if (user && !requiresMFA) {
      router.replace('/');
      router.refresh();
      return;
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('returnUrl');
    currentUrl.searchParams.delete('provider');
    currentUrl.searchParams.delete('error');
    currentUrl.searchParams.delete('error_description');

    const nextPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    router.replace(nextPath);
    router.refresh();
  }, [requiresMFA, router, setRedirectingAfterAuthState, user]);

  const sendOtpMutation = useMutation({
    mutationFn: (payload: Parameters<typeof sendOtpWithInternalApi>[0]) =>
      sendOtpWithInternalApi(payload),
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

  const passwordLoginMutation = useMutation({
    mutationFn: (payload: Parameters<typeof passwordLoginWithInternalApi>[0]) =>
      passwordLoginWithInternalApi(payload),
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
      const result = await sendOtpMutation.mutateAsync({
        captchaToken,
        client: 'web',
        email: normalizedEmail,
        locale,
      });
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
            description: formatDiagnosticDescription(
              result.error,
              result.diagnosticCode
            ),
          });
          openPasswordStage(normalizedEmail);
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
      openPasswordStage(normalizedEmail);
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
          description: formatDiagnosticDescription(
            result.error,
            result.diagnosticCode
          ),
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
    setPasswordRateLimitedEmail(null);

    try {
      const result = await passwordLoginMutation.mutateAsync({
        captchaToken,
        client: 'web',
        email: data.email,
        locale,
        password: data.password,
      });

      resetCaptcha();

      if (result.error) {
        const errorMessage = result.retryAfter
          ? `${result.error} (retry in ${result.retryAfter}s)`
          : result.error;
        const socialAuthHint = result.retryAfter
          ? t('login.rate_limited_social_auth_hint', { email: data.email })
          : null;

        setPasswordRateLimitedEmail(result.retryAfter ? data.email : null);

        passwordForm.setError('password', {
          message: errorMessage,
        });

        toast.error(t('login.failed'), {
          description: formatDiagnosticDescription(
            socialAuthHint ? `${errorMessage} ${socialAuthHint}` : errorMessage,
            result.diagnosticCode
          ),
        });

        setLoading(false);
        return;
      }

      await completePrimarySignIn('password');
    } catch (error) {
      console.error('[loginWithPassword] Unexpected error:', error);
      resetCaptcha();
      setPasswordRateLimitedEmail(null);

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
    const redirectUrl = new URL(
      '/api/auth/callback',
      resolveAuthRedirectOrigin({
        currentOrigin: window.location.origin,
      })
    );

    if (returnUrl) {
      redirectUrl.searchParams.set('returnUrl', returnUrl);
    }

    if (nextUrl) {
      redirectUrl.searchParams.set('nextUrl', nextUrl);
    }

    if (multiAccount === 'true') {
      redirectUrl.searchParams.set('multiAccount', 'true');
    }

    return redirectUrl.toString();
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

  const renderSocialLoginButtons = () => (
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
        onClick={() => void handleOAuthLogin('apple')}
        icon={<SocialLogoMask src="/media/logos/apple.svg" alt="Apple" />}
      >
        {t('login.continue_with_apple')}
      </SocialLoginButton>

      <SocialLoginButton
        disabled={loading}
        onClick={() => void handleOAuthLogin('github')}
        icon={<SocialLogoMask src="/media/logos/github.svg" alt="GitHub" />}
      >
        {t('login.continue_with_github')}
      </SocialLoginButton>
    </div>
  );

  const renderRateLimitedSocialAuthSuggestion = (email: string) => (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="text-muted-foreground text-sm leading-relaxed">
        {t('login.rate_limited_social_auth_hint', { email })}
      </p>
      {renderSocialLoginButtons()}
    </div>
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
    openPasswordStage(normalizedEmail);
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
    setPasswordRateLimitedEmail(null);
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
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setUser(user);

        if (user) {
          const requiresMfa = await needsMFA();
          setRequiresMFA(requiresMfa);
          setRedirectingAfterAuthState(!requiresMfa);
        } else {
          setRequiresMFA(false);
          setRedirectingAfterAuthState(false);
        }
      } catch (error) {
        console.error('[login] Failed to initialize auth state:', error);
        setUser(null);
        setRequiresMFA(false);
        setRedirectingAfterAuthState(false);
      } finally {
        setInitialized(true);
      }
    }

    void checkUser();
  }, [needsMFA, setRedirectingAfterAuthState, supabase.auth]);

  useEffect(() => {
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const diagnosticCode = searchParams.get('diagnosticCode');

    if (!error && !errorDescription && !diagnosticCode) {
      oauthErrorToastKeyRef.current = null;
      return;
    }

    const toastKey = `${error ?? ''}:${errorDescription ?? ''}:${diagnosticCode ?? ''}`;
    if (oauthErrorToastKeyRef.current === toastKey) {
      return;
    }

    oauthErrorToastKeyRef.current = toastKey;
    setRedirectingAfterAuthState(false);
    setLoading(false);

    toast.error(t('login.failed'), {
      description: formatDiagnosticDescription(
        errorDescription ||
          (error === 'auth_failed'
            ? t('login.oauth_callback_failed')
            : t('login.social_sign_in_failed')),
        diagnosticCode
      ),
    });
  }, [
    formatDiagnosticDescription,
    searchParams,
    setRedirectingAfterAuthState,
    t,
  ]);

  useEffect(() => {
    const processUrl = async () => {
      if (isResolvingReturnApp) {
        return;
      }

      if (hasActiveReturnUrlFailure) {
        setRedirectingAfterAuthState(false);
        setReadyForAuth(true);
        return;
      }

      const multiAccount = searchParams.get('multiAccount');

      if (multiAccount === 'true') {
        setRedirectingAfterAuthState(false);
        setReadyForAuth(true);
        return;
      }

      if (user && !requiresMFA) {
        if (isInternalAppReturn && !isRegisteredInternalAppReturn) {
          setRedirectingAfterAuthState(false);
          setReadyForAuth(true);
          return;
        }

        try {
          showRedirectingAfterAuth();
          await processNextUrl();
        } catch (error) {
          console.error(
            '[login] Failed to process authenticated returnUrl navigation:',
            error
          );
          const returnUrl = searchParams.get('returnUrl');

          if (returnUrl && !getSafeLocalReturnPath(returnUrl)) {
            markReturnUrlValidationFailure(returnUrl, error);
            return;
          }

          showRedirectingAfterAuth();
          window.location.href = '/';
        }
      } else {
        if (redirectingAfterAuthRef.current) {
          return;
        }

        setRedirectingAfterAuthState(false);
        setReadyForAuth(true);
      }
    };

    if (initialized) {
      void processUrl();
    }
  }, [
    hasActiveReturnUrlFailure,
    initialized,
    isInternalAppReturn,
    isRegisteredInternalAppReturn,
    isResolvingReturnApp,
    markReturnUrlValidationFailure,
    processNextUrl,
    requiresMFA,
    searchParams,
    setRedirectingAfterAuthState,
    showRedirectingAfterAuth,
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
    if (!canRenderAuthSurface || requiresMFA) {
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

    emailForm.setFocus('email');
  }, [
    authStage,
    canRenderAuthSurface,
    emailForm,
    otpForm,
    passwordForm,
    requiresMFA,
  ]);

  if (!canRenderAuthSurface) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  if (activeReturnUrlFailure) {
    return (
      <InvalidReturnUrlWarning
        onClear={clearInvalidReturnUrl}
        returnUrl={activeReturnUrlFailure.returnUrl}
      />
    );
  }

  if (
    user &&
    !requiresMFA &&
    isInternalAppReturn &&
    !isRegisteredInternalAppReturn
  ) {
    const currentUserProfile = currentUserProfileQuery.data;
    const hasMatchingCurrentProfile = currentUserProfile?.id === user.id;
    const currentProfileIsLoading =
      currentUserProfileQuery.isLoading ||
      (!hasMatchingCurrentProfile && currentUserProfileQuery.isFetching);
    const currentProfileIsReady =
      hasMatchingCurrentProfile && !currentProfileIsLoading;

    return (
      <Suspense fallback={<InternalAppAccountConfirmationFallback />}>
        <InternalAppAccountConfirmation
          accounts={accounts}
          activeAccountId={activeAccountId}
          appName={returnAppName}
          confirming={confirmingReturn}
          currentAvatarUrl={currentUserProfile?.avatar_url}
          currentDisplayName={
            currentUserProfile?.display_name ?? currentUserProfile?.full_name
          }
          currentEmail={currentUserProfile?.email}
          currentUserId={user.id}
          isAccountSwitcherReady={accountSwitcherInitialized}
          onContinue={() => void continueToInternalApp()}
          onRetryProfile={() => void currentUserProfileQuery.refetch()}
          onSwitchAccount={(accountId) => void switchToStoredAccount(accountId)}
          onUseAnotherAccount={() => void handleUseAnotherAccount()}
          profileState={
            currentProfileIsReady
              ? 'ready'
              : currentProfileIsLoading
                ? 'loading'
                : 'unavailable'
          }
          switchingAccountId={switchingAccountId}
        />
      </Suspense>
    );
  }

  if (redirectingAfterAuth) {
    return (
      <div>
        <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <LoadingIndicator className="size-6" />
            <p className="font-medium text-muted-foreground text-sm">
              {t('account_switcher.redirecting')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requiresMFA) {
    return (
      <div>
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
                        <Suspense fallback={<InputOTPRowFallback />}>
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
                        </Suspense>
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
      </div>
    );
  }

  return (
    <div>
      <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
        <CardContent className="p-6 sm:p-8">
          <div>
            {authStage === 'identify' ? (
              <div key="identify-auth" className={authStageTransitionClassName}>
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
                            {renderTurnstile(turnstileSiteKey)}
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

                    {webOtpEnabled ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 w-full rounded-2xl"
                        onClick={() => void advanceToPasswordStage()}
                        disabled={loading || isResolvingOtpEnablement}
                      >
                        {t('login.use_password_instead')}
                      </Button>
                    ) : null}
                  </form>
                </Form>

                <LoginMethodSeparator label={t('login.or')} />

                <PasskeyLoginButton
                  captchaToken={captchaToken}
                  canRenderTurnstile={turnstileClientState.canRenderWidget}
                  disabled={loading}
                  onAuthenticated={() => completePrimarySignIn('passkey')}
                  onCaptchaReset={resetCaptcha}
                  requiresTurnstile={turnstileClientState.isRequired}
                  turnstileError={captchaError}
                />

                <LoginMethodSeparator label={t('login.or')} />

                {renderSocialLoginButtons()}
              </div>
            ) : authStage === 'otp' ? (
              <div key="otp-auth" className={authStageTransitionClassName}>
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
                            <Suspense fallback={<InputOTPRowFallback />}>
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
                            </Suspense>
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
                            {renderTurnstile(turnstileSiteKey)}
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

                {otpRetryAfterSeconds > 0
                  ? renderRateLimitedSocialAuthSuggestion(
                      emailForm.getValues('email')
                    )
                  : null}
              </div>
            ) : (
              <div key="password-auth" className={authStageTransitionClassName}>
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
                    <FormField
                      control={passwordForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-medium text-sm">
                            {t('login.email')}
                          </FormLabel>
                          <FormControl>
                            <div className="group relative">
                              <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                className="h-12 rounded-2xl border-border/60 bg-muted/30 pl-10 font-medium text-foreground shadow-none"
                                {...field}
                                aria-readonly="true"
                                readOnly
                                tabIndex={-1}
                              />
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />

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
                                onClick={() => setShowPassword((prev) => !prev)}
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
                            {renderTurnstile(turnstileSiteKey)}
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
                        !passwordCredentialsAreValid ||
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

                {passwordRateLimitedEmail
                  ? renderRateLimitedSocialAuthSuggestion(
                      passwordRateLimitedEmail
                    )
                  : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

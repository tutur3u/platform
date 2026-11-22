'use client';

import { requiresAccountConfirmationForReturnApp } from './return-app-confirmation';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { SAFARI_SAFE_TURNSTILE_OPTIONS } from '@tuturuuu/cloudflare/turnstile/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from '@tuturuuu/icons/lucide-static';
import {
  createCrossAppReturnUrlWithInternalApi,
  createMfaMobileApprovalChallengeWithInternalApi,
  getOtpSettings,
  passwordLoginWithInternalApi,
  pollMfaMobileApprovalChallengeWithInternalApi,
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { getAppDomainByUrl } from '@tuturuuu/utils/internal-domains';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
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
import { buildOAuthCallbackUrl } from '@/lib/auth/oauth-callback-url';
import { normalizeManagedTuturuuuReturnUrl } from '@/lib/auth/managed-tuturuuu-return-url';
import {
  type AuthOAuthProvider,
  getAuthOAuthProviderOptions,
} from '@/lib/auth/oauth-providers';
import { appendDiagnosticReference } from './auth-diagnostic-copy';
import { resolveAuthRedirectOrigin } from './auth-redirect-origin';
import type { LoginViewState } from './use-login-view';
import { useReturnApp } from './use-return-app';
import { useSignInRouting } from './use-sign-in-routing';
import { ProfileLoadingState } from './internal-app-account-confirmation-parts';
import {
  classifyCrossAppHandoff,
  buildHandoffRequest,
  getConfirmedReturnKey,
  isSessionRefreshSettled,
  withHandoffTimeout,
} from './cross-app-handoff-outcome';
import {
  InvalidReturnUrlWarning,
  type ReturnUrlFailureKind,
} from './invalid-return-url-warning';
import {
  LoginEmailModePreference,
  processEmailInput,
} from './login-email-mode';
import { completeVerifiedMfaSignIn } from './mfa-navigation';
import { readMfaStepUpHint, useLoginMfaCheck } from './mfa-step-up';
import { MfaChallengeStep } from './mfa-challenge-step';
import {
  buildManagedTuturuuuCurrentReturnUrl,
  getPlatformVerifyTokenNextPath,
  getSafeLocalReturnPath,
  getStaticReturnApp,
  MANAGED_TUTURUUU_RETURN_APP,
} from './return-url-helpers';
import { RequiredMfaEnrollment } from './required-mfa-enrollment';
import {
  type AuthStage,
  InputOTPRowFallback,
  InternalAppAccountConfirmationFallback,
  RedirectingAfterAuthCard,
  TurnstileLoadingFallback,
  type MobileMfaApprovalChallenge,
  type ReturnUrlValidationFailure,
} from './login-form-parts';
import {
  FocusedSignInCard,
  FocusedSignInSkeleton,
} from './focused-sign-in-card';
import { type LoginMethod, rememberLoginMethod } from './last-login-method';
import { SavedAccountChooser } from './saved-account-chooser';
import { OAuthMethodButtons } from './sign-in-methods';
import { IdentifyStep } from './identify-step';
import { AuthInlineError } from './auth-inline-error';
import { authToast as toast } from './auth-inline-error-store';
import { resolveTurnstilePillState } from './turnstile-pill-state';
import {
  getTurnstileClientErrorMessageKey,
  resolveLoginTurnstileClientState,
  shouldHonorLocalE2EAuthBypassForLogin,
} from './turnstile-state';
import { useTurnstileRetry } from './use-turnstile-retry';
import { useAutoOAuthLogin } from './use-auto-oauth-login';
import { useDeferredAuthSurfaceRecovery } from './use-deferred-auth-surface-recovery';

const Turnstile = lazy(async () => {
  const { Turnstile: TurnstileComponent } =
    await import('@marsidev/react-turnstile');

  return { default: TurnstileComponent };
});

const InternalAppAccountConfirmation = lazy(async () => {
  const { InternalAppAccountConfirmation: Confirmation } =
    await import('./internal-app-account-confirmation');

  return { default: Confirmation };
});

const InputOTP = lazy(async () => {
  const { InputOTP: InputOTPComponent } =
    await import('@tuturuuu/ui/input-otp');

  return { default: InputOTPComponent };
});

const InputOTPGroup = lazy(async () => {
  const { InputOTPGroup: InputOTPGroupComponent } =
    await import('@tuturuuu/ui/input-otp');

  return { default: InputOTPGroupComponent };
});

const InputOTPSlot = lazy(async () => {
  const { InputOTPSlot: InputOTPSlotComponent } =
    await import('@tuturuuu/ui/input-otp');

  return { default: InputOTPSlotComponent };
});

type LoginFormProps = {
  deferAuthSurfaceUntilSessionCheck?: boolean;
  /** Private per-visitor view; absent where the form renders alone. */
  loginView?: LoginViewState;
  localE2EAuthBypass?: boolean;
  runtimeSupabaseConfig?: {
    supabasePublishableKey: string;
    supabaseUrl: string;
  } | null;
};

export default function LoginForm({
  deferAuthSurfaceUntilSessionCheck = false,
  loginView,
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
  const {
    didFailToResolveReturnApp,
    isRegisteredInternalAppReturn,
    isResolvingReturnApp,
    localReturnPath,
    refetchResolvedReturnApp,
    requiresReturnAppConfirmation,
    returnApp,
    returnAppName,
    shouldResolveReturnApp,
  } = useReturnApp({ loginView, returnUrl, searchParams });

  const emailModePreference = useRef(new LoginEmailModePreference());
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
  const [isHydrated, setIsHydrated] = useState(false);
  const [readyForAuth, setReadyForAuth] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [requiresMFA, setRequiresMFA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirectingAfterAuth, setRedirectingAfterAuth] = useState(false);
  const redirectingAfterAuthRef = useRef(false);
  const mfaStepUpAttemptedRef = useRef(false);
  const confirmedReturnRef = useRef<string | null>(null);
  const handoffInFlightRef = useRef(false);
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
  const [focusedContinueClicked, setFocusedContinueClicked] = useState(false);
  const [returnUrlValidationFailure, setReturnUrlValidationFailure] =
    useState<ReturnUrlValidationFailure | null>(null);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(
    null
  );
  const {
    focusedCanContinue,
    selfId,
    focusedPending,
    focusedSignIn,
    focusedStep,
    hasKnownSession,
    initialView,
    providerAutoStartAllowed,
    providerHint,
    requestAnotherAccount,
    savedAccounts,
    showSavedAccountChooser,
  } = useSignInRouting({
    initialized,
    localReturnPath,
    loginView,
    returnUrl,
    searchParams,
    user,
  });
  const oauthErrorToastKeyRef = useRef<string | null>(null);
  const captchaRefPassword = useRef<TurnstileInstance>(null);
  const currentUserProfileQuery = useCurrentUserProfile({
    enabled: Boolean(user && requiresReturnAppConfirmation && !requiresMFA),
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
  const preferredEmailMode = emailModePreference.current.resolve(
    processEmailInput(emailValue),
    webOtpEnabled
  );
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
      ? { kind: 'invalid' as const, returnUrl }
      : null;
  const activeReturnUrlFailure =
    returnUrlValidationFailure?.returnUrl === returnUrl
      ? returnUrlValidationFailure
      : resolvedReturnUrlFailure;
  const hasActiveReturnUrlFailure = Boolean(activeReturnUrlFailure);
  const canRenderAuthSurface =
    readyForAuth ||
    (!deferAuthSurfaceUntilSessionCheck && (!initialized || user === null));
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
    (failedReturnUrl: string, kind: ReturnUrlFailureKind = 'invalid') => {
      setRedirectingAfterAuthState(false);
      setReturnUrlValidationFailure({ kind, returnUrl: failedReturnUrl });
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

  const resetCaptchaAfterError = useCallback(() => {
    captchaRefPassword.current?.reset();
    setCaptchaError(undefined);
  }, []);
  const captchaRetry = useTurnstileRetry(resetCaptchaAfterError, resetCaptcha);
  const retryCaptchaManually = useCallback(() => {
    captchaRetry.cancel();
    setCaptchaToken(undefined);
    resetCaptchaAfterError();
  }, [captchaRetry, resetCaptchaAfterError]);

  const handleCaptchaSuccess = useCallback(
    (token: string) => {
      captchaRetry.onSuccess();
      setCaptchaToken(token);
      setCaptchaError(undefined);
      setPasswordRateLimitedEmail(null);
      passwordForm.clearErrors('password');
    },
    [captchaRetry, passwordForm]
  );

  const handleCaptchaError = useCallback(
    (errorCode?: string) => {
      console.warn('[Turnstile] Error:', errorCode);
      setCaptchaToken(undefined);
      setPasswordRateLimitedEmail(null);
      passwordForm.clearErrors('password');
      setCaptchaError(
        t(`login.${getTurnstileClientErrorMessageKey(errorCode)}`)
      );
      return captchaRetry.onError(errorCode);
    },
    [captchaRetry, passwordForm, t]
  );

  // The widget mounts empty and grows once its script loads; a fixed slot of
  // its rendered size (300 x 65) keeps the form from shifting.
  const renderTurnstile = (siteKey: string) => (
    <div className="flex h-[65px] w-[300px] max-w-full items-center justify-center overflow-hidden">
      <Suspense fallback={<TurnstileLoadingFallback />}>
        <Turnstile
          ref={captchaRefPassword}
          siteKey={siteKey}
          options={SAFARI_SAFE_TURNSTILE_OPTIONS}
          onSuccess={handleCaptchaSuccess}
          onExpire={() => setCaptchaToken(undefined)}
          onError={handleCaptchaError}
          onTimeout={captchaRetry.onTimeout}
        />
      </Suspense>
    </div>
  );

  const mfaStepUpRequested = readMfaStepUpHint(searchParams);
  const needsMFA = useLoginMfaCheck(supabase, searchParams);

  const prepareReturnAppConfirmation = useCallback(async () => {
    const returnUrl = searchParams.get('returnUrl');

    if (!returnUrl || getSafeLocalReturnPath(returnUrl)) {
      return false;
    }

    let resolvedReturnApp = returnApp;

    if (!resolvedReturnApp && shouldResolveReturnApp) {
      const refetchResult = await refetchResolvedReturnApp();

      if (refetchResult.error) {
        markReturnUrlValidationFailure(returnUrl);
        return true;
      }

      resolvedReturnApp = refetchResult.data?.targetApp ?? null;
    }

    if (!resolvedReturnApp) {
      markReturnUrlValidationFailure(returnUrl);
      return true;
    }

    if (
      !requiresAccountConfirmationForReturnApp(
        resolvedReturnApp,
        isRegisteredInternalAppReturn,
        searchParams.get('confirmAccount') === '1'
      )
    ) {
      return false;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (
      !user ||
      confirmedReturnRef.current === getConfirmedReturnKey(user.id, returnUrl)
    ) {
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
      const returnApp = getStaticReturnApp(returnUrl, localReturnPath);

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

      if (returnApp === MANAGED_TUTURUUU_RETURN_APP) {
        const managedReturnUrl = normalizeManagedTuturuuuReturnUrl(returnUrl);

        if (!managedReturnUrl) {
          throw new Error('Invalid returnUrl');
        }

        await supabase.auth.refreshSession();

        const nextUrl = new URL(managedReturnUrl);

        if (nextUrl.origin !== window.location.origin) {
          window.location.assign(nextUrl.toString());
        } else {
          router.push(nextUrl.toString());
          router.refresh();
        }

        return;
      }

      // One mint per attempt, even under concurrent bootstrap calls.
      if (handoffInFlightRef.current) return;
      handoffInFlightRef.current = true;
      const handoff = await withHandoffTimeout(
        createCrossAppReturnUrlWithInternalApi(
          buildHandoffRequest(
            searchParams,
            returnUrl,
            confirmedReturnRef.current
          )
        )
      ).catch(() => null);
      const outcome = classifyCrossAppHandoff(handoff, {
        stepUpAttempted: mfaStepUpAttemptedRef.current,
      });
      if (outcome.kind !== 'redirect') handoffInFlightRef.current = false;
      if (outcome.kind === 'mfa_step_up') {
        mfaStepUpAttemptedRef.current = true;
        setConfirmingReturn(false);
        setRedirectingAfterAuthState(false);
        setLoading(false);
        setRequiresMFA(true);
        return;
      }
      if (outcome.kind === 'failure') {
        markReturnUrlValidationFailure(returnUrl, outcome.failure);
        return;
      }
      const refreshCompleted = await withHandoffTimeout(
        supabase.auth.refreshSession()
      ).then(
        (result: unknown) => isSessionRefreshSettled(result),
        () => false
      );
      if (!refreshCompleted) {
        handoffInFlightRef.current = false;
        markReturnUrlValidationFailure(returnUrl, 'refresh');
        return;
      }
      window.location.assign(new URL(outcome.returnUrl).toString());
      return;
    }

    const nextUrl = searchParams.get('nextUrl');

    if (nextUrl) {
      router.push(normalizeClientRedirectPath(nextUrl));
    } else {
      router.push('/');
    }

    router.refresh();
  }, [
    markReturnUrlValidationFailure,
    router,
    searchParams,
    setRedirectingAfterAuthState,
    supabase,
  ]);

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
      rememberLoginMethod(source === 'passkey' ? 'passkey' : 'email');
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
            markReturnUrlValidationFailure(returnUrl);
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
    // Only this explicit Continue confirms the return, for this account and
    // this exact returnUrl; an MFA step-up after it does not ask again.
    confirmedReturnRef.current = getConfirmedReturnKey(
      selfId,
      searchParams.get('returnUrl')
    );

    try {
      await processNextUrl();
    } catch (error) {
      console.error('[login] Failed to continue to internal app:', error);
      const returnUrl = searchParams.get('returnUrl');

      if (returnUrl && !getSafeLocalReturnPath(returnUrl)) {
        markReturnUrlValidationFailure(returnUrl);
      }

      toast.error(t('login.internal_app_continue_failed'));
      setConfirmingReturn(false);
    }
  }, [markReturnUrlValidationFailure, processNextUrl, searchParams, t, selfId]);

  const switchToStoredAccount = useCallback(
    async (accountId: string) => {
      setSwitchingAccountId(accountId);

      const result = await switchAccount(accountId, {
        targetRoute: `${window.location.pathname}${window.location.search}`,
      });

      if (!result.success) {
        toast.error(t('login.account_switch_failed'), {
          description: formatDiagnosticDescription(
            result.requiresReauth
              ? t('login.account_switch_requires_reauth')
              : result.error,
            result.diagnosticCode
          ),
        });
        setSwitchingAccountId(null);
      }
    },
    [formatDiagnosticDescription, switchAccount, t]
  );

  const handleUseAnotherAccount = useCallback(async () => {
    confirmedReturnRef.current = null;
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

  const sendEmailOtp = async (explicitChoice = false) => {
    const isValid = await emailForm.trigger('email');
    if (!isValid || !locale) {
      return;
    }

    const normalizedEmail = emailSchema.parse(emailForm.getValues('email'));
    emailForm.setValue('email', normalizedEmail, { shouldValidate: true });
    passwordForm.setValue('email', normalizedEmail, { shouldDirty: true });
    if (explicitChoice)
      emailModePreference.current.choose(normalizedEmail, 'otp');

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
          openOtpStage({ preserveOtpValue: authStage === 'otp' });
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
      openOtpStage({ preserveOtpValue: authStage === 'otp' });
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

  const buildOAuthRedirectUrl = useCallback(
    () =>
      buildOAuthCallbackUrl({
        callbackOrigin: resolveAuthRedirectOrigin({
          currentOrigin: window.location.origin,
          preserveCurrentManagedOrigin: true,
        }),
        fallbackReturnUrl: buildManagedTuturuuuCurrentReturnUrl(),
        searchParams,
      }),
    [searchParams]
  );

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
      if (!error) rememberLoginMethod(provider);

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

  // Email and passkey live on the identify step itself; only OAuth starts here.
  const chooseSignInMethod = (method: LoginMethod) => {
    if (method !== 'email' && method !== 'passkey')
      void handleOAuthLogin(method);
  };
  const renderRateLimitedSocialAuthSuggestion = (email: string) => (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="text-muted-foreground text-sm leading-relaxed">
        {t('login.rate_limited_social_auth_hint', { email })}
      </p>
      <OAuthMethodButtons disabled={loading} onChoose={chooseSignInMethod} />
    </div>
  );

  useEffect(() => setIsHydrated(true), []);
  useDeferredAuthSurfaceRecovery(
    deferAuthSurfaceUntilSessionCheck,
    initialized,
    readyForAuth,
    setRedirectingAfterAuthState,
    setReadyForAuth
  );
  // Never beside an unverified or failed return target. A focused sign-in
  // starts from the server view; elsewhere the session check runs first.
  useAutoOAuthLogin(
    providerHint,
    providerAutoStartAllowed &&
      !hasActiveReturnUrlFailure &&
      !isResolvingReturnApp &&
      !requiresMFA &&
      !user &&
      (focusedSignIn || (initialized && readyForAuth)),
    handleOAuthLogin
  );

  const advanceToPasswordStage = async (explicitChoice = true) => {
    const isValid = await emailForm.trigger('email');

    if (!isValid) return;

    const normalizedEmail = emailSchema.parse(emailForm.getValues('email'));

    emailForm.setValue('email', normalizedEmail, { shouldValidate: true });
    if (explicitChoice)
      emailModePreference.current.choose(normalizedEmail, 'password');
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
          (error === 'azure_tenant_restricted'
            ? t('login.microsoft_tenant_restricted')
            : error === 'auth_failed'
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
        if (requiresReturnAppConfirmation) {
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
            markReturnUrlValidationFailure(returnUrl);
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
    isResolvingReturnApp,
    markReturnUrlValidationFailure,
    processNextUrl,
    requiresReturnAppConfirmation,
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

  if (focusedPending) return <FocusedSignInSkeleton />;

  if (focusedSignIn && !activeReturnUrlFailure && !requiresMFA) {
    return (
      <FocusedSignInCard
        appName={initialView?.returnApp?.name ?? returnAppName}
        canContinue={focusedCanContinue}
        continuing={
          focusedContinueClicked && (confirmingReturn || redirectingAfterAuth)
        }
        onContinue={() => {
          setFocusedContinueClicked(true);
          void continueToInternalApp();
        }}
        onStartProvider={() =>
          providerHint && void handleOAuthLogin(providerHint)
        }
        onSwitchAccount={(accountId) => void switchToStoredAccount(accountId)}
        onUseAnotherAccount={() => {
          requestAnotherAccount();
          if (hasKnownSession) void handleUseAnotherAccount();
        }}
        providerName={
          getAuthOAuthProviderOptions(providerHint ?? 'google').name
        }
        savedAccounts={savedAccounts}
        session={initialView?.session ?? null}
        startingProvider={loading}
        step={focusedStep}
        switchingAccountId={switchingAccountId}
      />
    );
  }

  if (!canRenderAuthSurface && (!returnUrl || localReturnPath)) {
    return (
      <RedirectingAfterAuthCard label={t('account_switcher.redirecting')} />
    );
  }

  if (!canRenderAuthSurface) {
    return (
      <ProfileLoadingState
        appName={returnAppName}
        disabled
        onUseAnotherAccount={() => void handleUseAnotherAccount()}
      />
    );
  }

  if (activeReturnUrlFailure) {
    return (
      <InvalidReturnUrlWarning
        failure={activeReturnUrlFailure.kind}
        onClear={clearInvalidReturnUrl}
        returnUrl={activeReturnUrlFailure.returnUrl}
      />
    );
  }

  if (user && !requiresMFA && requiresReturnAppConfirmation) {
    const currentUserProfile = currentUserProfileQuery.data;
    const hasMatchingCurrentProfile = currentUserProfile?.id === user.id;
    const currentProfileIsLoading =
      currentUserProfileQuery.isLoading ||
      (!hasMatchingCurrentProfile && currentUserProfileQuery.isFetching);
    const currentProfileIsReady =
      hasMatchingCurrentProfile && !currentProfileIsLoading;

    return (
      <Suspense
        fallback={
          <InternalAppAccountConfirmationFallback
            appName={returnAppName}
            disabled={confirmingReturn || switchingAccountId !== null}
            onUseAnotherAccount={() => void handleUseAnotherAccount()}
          />
        }
      >
        <InternalAppAccountConfirmation
          accounts={accounts}
          activeAccountId={activeAccountId}
          appName={returnAppName}
          confirming={confirmingReturn}
          currentAvatarUrl={currentUserProfile?.avatar_url}
          currentDisplayName={resolveUserDisplayName({
            display_name: currentUserProfile?.display_name,
            full_name: currentUserProfile?.full_name,
          })}
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
      <RedirectingAfterAuthCard label={t('account_switcher.redirecting')} />
    );
  }

  if (showSavedAccountChooser && !requiresMFA) {
    return (
      <SavedAccountChooser
        accounts={savedAccounts}
        appName={returnUrl && !localReturnPath ? returnAppName : null}
        onSwitchAccount={(accountId) => void switchToStoredAccount(accountId)}
        onUseAnotherAccount={requestAnotherAccount}
        switchingAccountId={switchingAccountId}
      />
    );
  }

  if (requiresMFA) {
    return (
      <RequiredMfaEnrollment key={user?.id} onVerified={completeMfaSignIn}>
        <MfaChallengeStep
          form={totpForm}
          loading={loading}
          mobile={
            mfaStepUpRequested
              ? null
              : {
                  challenge: mobileMfaChallenge,
                  onRequest: () => createMobileMfaChallengeMutation.mutate(),
                  pending: createMobileMfaChallengeMutation.isPending,
                }
          }
          onSubmit={verifyTOtp}
          stepUp={mfaStepUpRequested}
        />
      </RequiredMfaEnrollment>
    );
  }

  return (
    <fieldset disabled={!isHydrated} className="contents">
      {/* The email-first step sits flat on the page; later steps are cards. */}
      <Card
        className={
          authStage === 'identify'
            ? 'overflow-visible border-0 bg-transparent shadow-none!'
            : 'overflow-hidden rounded-3xl border bg-card shadow-elevation-1!'
        }
      >
        <CardContent
          className={authStage === 'identify' ? 'p-0' : 'p-6 sm:p-8'}
        >
          <div className="space-y-6">
            <AuthInlineError busy={loading} key={authStage} />
            {authStage === 'identify' ? (
              <div key="identify-auth" className={authStageTransitionClassName}>
                <IdentifyStep
                  autoFocusEmail={transitionDirection < 0}
                  continueDisabled={
                    isResolvingOtpEnablement ||
                    loading ||
                    !emailIsValid ||
                    (preferredEmailMode === 'otp' &&
                      isCaptchaBlockingPasswordSubmit)
                  }
                  emailForm={emailForm}
                  loading={loading}
                  normalizedPreviewEmail={normalizedPreviewEmail}
                  onBlurUsername={() => setShowDomainPreview(true)}
                  onChooseProvider={chooseSignInMethod}
                  onEmailInput={(value) => {
                    setShowDomainPreview(false);
                    passwordForm.setValue('email', value, {
                      shouldDirty: true,
                    });
                  }}
                  onSubmit={() => {
                    if (loading || isResolvingOtpEnablement) return;
                    if (preferredEmailMode === 'otp') void sendEmailOtp();
                    else void advanceToPasswordStage(false);
                  }}
                  onUsePassword={() => void advanceToPasswordStage()}
                  passkey={{
                    canRenderTurnstile: turnstileClientState.canRenderWidget,
                    captchaToken,
                    onAuthenticated: () => completePrimarySignIn('passkey'),
                    onCaptchaReset: resetCaptcha,
                    requiresTurnstile: turnstileClientState.isRequired,
                  }}
                  pending={loading || isResolvingOtpEnablement}
                  turnstile={{
                    detail:
                      turnstileClientState.canRenderWidget && turnstileSiteKey
                        ? captchaError
                        : t('login.captcha_not_configured'),
                    onRetry: retryCaptchaManually,
                    state: resolveTurnstilePillState({
                      ...turnstileClientState,
                      error: captchaError,
                      token: captchaToken,
                    }),
                    widget:
                      isResolvingOtpEnablement || !turnstileSiteKey ? (
                        <TurnstileLoadingFallback />
                      ) : (
                        renderTurnstile(turnstileSiteKey)
                      ),
                  }}
                  usePasswordAvailable={webOtpEnabled}
                />
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
                                      className="h-12 w-full rounded-2xl border border-border bg-background font-semibold text-lg transition-all duration-200 focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
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
                      className="h-12 w-full rounded-2xl font-medium"
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
                        onClick={() => void advanceToPasswordStage()}
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
                                className="h-12 rounded-2xl border-border bg-background pr-12 pl-10 transition-all duration-200 focus:border-primary/40 focus-visible:ring-primary/15"
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
                      className="h-12 w-full rounded-2xl font-medium"
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
                        onClick={() => void sendEmailOtp(true)}
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
    </fieldset>
  );
}

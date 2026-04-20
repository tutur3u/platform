import 'dart:async';

import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextButton, TextField;
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum _LoginStage { identify, otp, password }

class LoginPage extends StatefulWidget {
  const LoginPage({
    this.addAccountMode = false,
    super.key,
  });

  final bool addAccountMode;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  static const _stepTransitionDuration = Duration(milliseconds: 420);
  static const _otpAvailabilityGracePeriod = Duration(seconds: 3);
  static const _androidBackChannel = MethodChannel('mobile/shell_back');
  static const _androidDefaultExitMessage = 'Press back again to exit';
  static const _androidDefaultExitHintMessage = 'Press back again to exit app';

  final _emailController = TextEditingController(
    text: Env.isDevelopment ? 'local@tuturuuu.com' : '',
  );
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController(
    text: Env.isDevelopment ? 'password123' : '',
  );
  final _emailFocusNode = FocusNode();
  final _otpFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();

  _LoginStage _stage = _LoginStage.identify;
  int _retryAfter = 0;
  String? _captchaToken;
  Timer? _retryAfterTimer;
  Timer? _otpAvailabilityGraceTimer;
  bool _otpAvailabilityGraceExpired = false;

  bool get _isOtpStage => _stage == _LoginStage.otp;
  bool get _isPasswordStage => _stage == _LoginStage.password;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      if (widget.addAccountMode) {
        context.read<AuthCubit>().setAddAccountFlow(enabled: true);
      }
    });
    _otpAvailabilityGraceTimer = Timer(_otpAvailabilityGracePeriod, () {
      if (!mounted) {
        return;
      }
      setState(() => _otpAvailabilityGraceExpired = true);
    });
  }

  @override
  void didUpdateWidget(covariant LoginPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.addAccountMode != widget.addAccountMode) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        context.read<AuthCubit>().setAddAccountFlow(
          enabled: widget.addAccountMode,
        );
      });
      if (oldWidget.addAccountMode && !widget.addAccountMode) {
        _clearAndroidBackState();
      }
    }
    _syncAndroidBackState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncAndroidBackState();
  }

  @override
  void dispose() {
    if (widget.addAccountMode) {
      _clearAndroidBackState();
    }
    _retryAfterTimer?.cancel();
    _otpAvailabilityGraceTimer?.cancel();
    _emailController.dispose();
    _otpController.dispose();
    _passwordController.dispose();
    _emailFocusNode.dispose();
    _otpFocusNode.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  ({bool isResolving, bool otpEnabled}) _otpAvailability(
    BuildContext context,
  ) {
    try {
      final cubit = BlocProvider.of<AppVersionCubit>(context);
      final versionState = cubit.state;
      return (
        isResolving: !versionState.hasCompletedInitialCheck,
        otpEnabled: versionState.versionCheck?.otpEnabled ?? false,
      );
    } on Object {
      return (isResolving: false, otpEnabled: false);
    }
  }

  void _clearCaptcha() {
    if (_captchaToken != null) {
      setState(() => _captchaToken = null);
    }
  }

  bool _isOtpCooldownError(String? error) {
    if (error == null) {
      return false;
    }

    final normalized = error.toLowerCase();
    return normalized.contains('too many') && normalized.contains('otp');
  }

  void _stopRetryAfterTimer() {
    _retryAfterTimer?.cancel();
    _retryAfterTimer = null;
  }

  void _scheduleRetryAfterCountdown() {
    _stopRetryAfterTimer();
    if (_retryAfter <= 0) {
      return;
    }

    _retryAfterTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      if (_retryAfter <= 1) {
        timer.cancel();
        setState(() => _retryAfter = 0);
        return;
      }

      setState(() => _retryAfter -= 1);
    });
  }

  void _showOtpStage({bool clearOtp = true, int retryAfter = 0}) {
    context.read<AuthCubit>().clearError();
    _stopRetryAfterTimer();
    setState(() {
      _stage = _LoginStage.otp;
      _retryAfter = retryAfter;
      if (clearOtp) {
        _otpController.clear();
      }
    });
    _scheduleRetryAfterCountdown();
    Future<void>.delayed(const Duration(milliseconds: 180), () {
      if (mounted && _isOtpStage) {
        _otpFocusNode.requestFocus();
      }
    });
  }

  void _showPasswordStage() {
    context.read<AuthCubit>().clearError();
    _stopRetryAfterTimer();
    setState(() {
      _stage = _LoginStage.password;
      _retryAfter = 0;
    });
    _clearCaptcha();
    Future<void>.delayed(const Duration(milliseconds: 180), () {
      if (mounted && _isPasswordStage) {
        _passwordFocusNode.requestFocus();
      }
    });
  }

  void _showIdentifyStage() {
    context.read<AuthCubit>().clearError();
    _stopRetryAfterTimer();
    setState(() {
      _stage = _LoginStage.identify;
      _retryAfter = 0;
    });
    _clearCaptcha();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _emailFocusNode.requestFocus();
      }
    });
  }

  Future<void> _handleSendOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      _emailFocusNode.requestFocus();
      return;
    }

    final captcha = _captchaToken;
    _clearCaptcha();

    final result = await context.read<AuthCubit>().sendOtp(
      email,
      captchaToken: captcha,
    );

    if (!mounted) {
      return;
    }

    if (result.success) {
      _showOtpStage();
      return;
    }

    final retryAfter = result.retryAfter ?? 0;
    if (retryAfter > 0) {
      _showOtpStage(clearOtp: false, retryAfter: retryAfter);
      return;
    }

    _stopRetryAfterTimer();
    if (mounted) {
      setState(() => _retryAfter = 0);
    }
  }

  Future<void> _handleVerifyOtp() async {
    final email = _emailController.text.trim();
    final otp = _otpController.text.trim();
    if (email.isEmpty || otp.length < 6) {
      return;
    }

    await context.read<AuthCubit>().verifyOtp(email, otp);
  }

  Future<void> _handlePasswordLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) {
      return;
    }

    final captcha = _captchaToken;
    _clearCaptcha();

    await context.read<AuthCubit>().signInWithPassword(
      email,
      password,
      captchaToken: captcha,
    );
  }

  Future<void> _handleGoogleSignIn() {
    return context.read<AuthCubit>().signInWithGoogle();
  }

  Future<void> _handleAppleSignIn() {
    return context.read<AuthCubit>().signInWithApple();
  }

  Future<void> _handleMicrosoftSignIn() {
    return context.read<AuthCubit>().signInWithMicrosoft();
  }

  Future<void> _handleGithubSignIn() {
    return context.read<AuthCubit>().signInWithGithub();
  }

  void _syncAndroidBackState() {
    if (!widget.addAccountMode ||
        defaultTargetPlatform != TargetPlatform.android) {
      return;
    }

    final l10n = context.l10n;
    unawaited(
      _androidBackChannel.invokeMethod<void>('updateState', {
        'route': '/add-account',
        'exitMessage': l10n.commonPressBackAgainToExit,
        'exitHintMessage': l10n.commonPressBackAgainToExitHint,
      }),
    );
  }

  void _clearAndroidBackState() {
    if (defaultTargetPlatform != TargetPlatform.android) {
      return;
    }
    unawaited(
      _androidBackChannel.invokeMethod<void>('updateState', {
        'route': '/',
        'exitMessage': _androidDefaultExitMessage,
        'exitHintMessage': _androidDefaultExitHintMessage,
      }),
    );
  }

  Future<void> _onCancelAddAccount() async {
    final authCubit = context.read<AuthCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final ok = await authCubit.cancelAddAccountFlow();
    if (!mounted) {
      return;
    }
    if (ok) {
      return;
    }
    final message = authCubit.state.error;
    if (!toastContext.mounted) {
      return;
    }
    shad.showToast(
      context: toastContext,
      builder: (ctx, _) => shad.Alert.destructive(
        title: Text(message ?? ctx.l10n.authSwitchAccountFailed),
      ),
    );
  }

  Widget _buildTurnstile({required bool enabled}) {
    final theme = shad.Theme.of(context);

    if (!Env.isTurnstileConfigured) {
      return const SizedBox.shrink();
    }

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 312),
        child: CloudflareTurnstile(
          siteKey: Env.turnstileSiteKey,
          baseUrl: Env.turnstileBaseUrl,
          options: TurnstileOptions(
            size: TurnstileSize.flexible,
            theme: theme.brightness == Brightness.dark
                ? TurnstileTheme.dark
                : TurnstileTheme.light,
          ),
          onTokenReceived: enabled
              ? (token) {
                  setState(() => _captchaToken = token);
                }
              : (_) {},
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final otpAvailability = _otpAvailability(context);
    final otpEnabled = otpAvailability.otpEnabled;
    final isResolvingOtpEnablement =
        otpAvailability.isResolving && !_otpAvailabilityGraceExpired;

    final authScaffold = AuthScaffold(
      title: widget.addAccountMode ? l10n.authAddAccountTitle : l10n.loginTitle,
      showBackButton: widget.addAccountMode,
      backButtonLabel: widget.addAccountMode ? l10n.navHome : null,
      onBack: widget.addAccountMode
          ? () => unawaited(_onCancelAddAccount())
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AnimatedSwitcher(
            duration: _stepTransitionDuration,
            reverseDuration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) {
              return FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.04),
                    end: Offset.zero,
                  ).animate(animation),
                  child: child,
                ),
              );
            },
            child: KeyedSubtree(
              key: ValueKey(_stage.name),
              child: switch (_stage) {
                _LoginStage.identify => _buildIdentifySection(
                  otpEnabled: otpEnabled,
                  isResolvingOtpEnablement: isResolvingOtpEnablement,
                ),
                _LoginStage.otp => _buildOtpSection(otpEnabled),
                _LoginStage.password => _buildPasswordSection(otpEnabled),
              },
            ),
          ),
          if (_stage == _LoginStage.identify) ...[
            const shad.Gap(24),
            AuthMethodDivider(label: l10n.authContinueWithSocial),
            const shad.Gap(18),
            _buildSocialSection(),
          ],
          BlocBuilder<AuthCubit, AuthState>(
            buildWhen: (prev, curr) =>
                prev.error != curr.error || prev.errorCode != curr.errorCode,
            builder: (context, state) {
              final errorText = resolveAuthErrorMessage(
                l10n: l10n,
                error: state.error,
                errorCode: state.errorCode,
              );
              final shouldHideCooldownError =
                  (_stage == _LoginStage.otp && _retryAfter > 0) ||
                  (_stage != _LoginStage.identify &&
                      _isOtpCooldownError(state.error));
              if (errorText == null || shouldHideCooldownError) {
                return const SizedBox.shrink();
              }
              return Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  errorText,
                  style: TextStyle(
                    color: theme.colorScheme.destructive,
                  ),
                  textAlign: TextAlign.center,
                ),
              );
            },
          ),
          const shad.Gap(20),
          Center(
            child: GestureDetector(
              onTap: widget.addAccountMode
                  ? null
                  : () => context.push('/signup'),
              child: Text(
                widget.addAccountMode
                    ? l10n.authAddAccountHint
                    : l10n.loginSignUpPrompt,
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: widget.addAccountMode
                      ? theme.colorScheme.mutedForeground.withValues(
                          alpha: 0.92,
                        )
                      : theme.colorScheme.mutedForeground.withValues(
                          alpha: 0.82,
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );

    if (!widget.addAccountMode) {
      return authScaffold;
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          return;
        }
        unawaited(_onCancelAddAccount());
      },
      child: authScaffold,
    );
  }

  Widget _buildIdentifySection({
    required bool otpEnabled,
    required bool isResolvingOtpEnablement,
  }) {
    return AuthSectionCard(
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
        builder: (context, state) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              shad.TextField(
                key: const shad.FormKey<String>(#loginEmail),
                controller: _emailController,
                focusNode: _emailFocusNode,
                placeholder: Text(context.l10n.emailLabel),
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) {
                  if (isResolvingOtpEnablement) {
                    return;
                  }
                  if (otpEnabled) {
                    unawaited(_handleSendOtp());
                    return;
                  }
                  _showPasswordStage();
                },
              ),
              const shad.Gap(16),
              if (!isResolvingOtpEnablement && otpEnabled) ...[
                if (Env.isTurnstileConfigured) ...[
                  _buildTurnstile(enabled: !state.isLoading),
                  const shad.Gap(8),
                ],
              ],
              AuthPrimaryButton(
                label: context.l10n.loginContinueWithEmail,
                onPressed:
                    isResolvingOtpEnablement ||
                        _emailController.text.trim().isEmpty ||
                        (otpEnabled &&
                            Env.isTurnstileConfigured &&
                            _captchaToken == null)
                    ? null
                    : (otpEnabled ? _handleSendOtp : _showPasswordStage),
                isLoading: state.isLoading || isResolvingOtpEnablement,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildOtpSection(bool otpEnabled) {
    return AuthSectionCard(
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
        builder: (context, state) {
          final theme = shad.Theme.of(context);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: shad.GhostButton(
                  onPressed: state.isLoading ? null : _showIdentifyStage,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.arrow_back, size: 18),
                      const shad.Gap(8),
                      Text(context.l10n.navBack),
                    ],
                  ),
                ),
              ),
              const shad.Gap(8),
              Text(
                _emailController.text.trim(),
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const shad.Gap(10),
              Text(
                _retryAfter > 0
                    ? context.l10n.loginOtpRateLimitedInstruction(_retryAfter)
                    : context.l10n.loginOtpInstruction,
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground.withValues(
                    alpha: 0.82,
                  ),
                ),
              ),
              const shad.Gap(18),
              Center(
                child: AuthOtpField(
                  controller: _otpController,
                  focusNode: _otpFocusNode,
                  enabled: !state.isLoading,
                  autofocus: true,
                  onChanged: (_) => setState(() {}),
                  onCompleted: (_) => _handleVerifyOtp(),
                ),
              ),
              const shad.Gap(18),
              AuthPrimaryButton(
                label: context.l10n.loginVerifyOtp,
                onPressed:
                    state.isLoading || _otpController.text.trim().length != 6
                    ? null
                    : _handleVerifyOtp,
                isLoading: state.isLoading,
              ),
              if (Env.isTurnstileConfigured) ...[
                const shad.Gap(10),
                _buildTurnstile(enabled: !state.isLoading),
              ],
              const shad.Gap(10),
              AuthSecondaryButton(
                variant: AuthSecondaryButtonVariant.ghost,
                onPressed: state.isLoading
                    ? null
                    : ((otpEnabled &&
                              _retryAfter <= 0 &&
                              (!Env.isTurnstileConfigured ||
                                  _captchaToken != null))
                          ? _handleSendOtp
                          : null),
                label: _retryAfter > 0
                    ? context.l10n.loginRetryIn(_retryAfter)
                    : context.l10n.loginResendOtp,
              ),
              const shad.Gap(6),
              AuthSecondaryButton(
                variant: AuthSecondaryButtonVariant.ghost,
                onPressed: state.isLoading ? null : _showPasswordStage,
                label: context.l10n.loginUsePasswordInstead,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildPasswordSection(bool otpEnabled) {
    return AuthSectionCard(
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
        builder: (context, state) {
          final theme = shad.Theme.of(context);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: shad.GhostButton(
                  onPressed: state.isLoading ? null : _showIdentifyStage,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.arrow_back, size: 18),
                      const shad.Gap(8),
                      Text(context.l10n.navBack),
                    ],
                  ),
                ),
              ),
              const shad.Gap(8),
              Text(
                _emailController.text.trim(),
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const shad.Gap(16),
              shad.FormField(
                key: const shad.FormKey<String>(#loginPassword),
                label: Text(context.l10n.passwordLabel),
                child: shad.TextField(
                  controller: _passwordController,
                  focusNode: _passwordFocusNode,
                  placeholder: Text(context.l10n.passwordLabel),
                  obscureText: true,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _handlePasswordLogin(),
                  features: const [
                    shad.InputFeature.passwordToggle(),
                  ],
                ),
              ),
              const shad.Gap(8),
              Align(
                alignment: Alignment.centerRight,
                child: shad.GhostButton(
                  onPressed: () => context.push('/forgot-password'),
                  child: Text(context.l10n.loginForgotPassword),
                ),
              ),
              const shad.Gap(8),
              if (Env.isTurnstileConfigured) ...[
                _buildTurnstile(enabled: !state.isLoading),
                const shad.Gap(8),
              ],
              AuthPrimaryButton(
                label: context.l10n.loginSignIn,
                onPressed: (Env.isTurnstileConfigured && _captchaToken == null)
                    ? null
                    : _handlePasswordLogin,
                isLoading: state.isLoading,
              ),
              if (otpEnabled) ...[
                const shad.Gap(10),
                AuthSecondaryButton(
                  variant: AuthSecondaryButtonVariant.ghost,
                  onPressed: state.isLoading ? null : _showOtpStage,
                  label: context.l10n.loginUseOtpInstead,
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _buildSocialSection() {
    return AuthSectionCard(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
        builder: (context, state) {
          return AuthSocialButtons(
            isLoading: state.isLoading,
            onGooglePressed: _handleGoogleSignIn,
            onMicrosoftPressed: _handleMicrosoftSignIn,
            onApplePressed: _handleAppleSignIn,
            onGithubPressed: _handleGithubSignIn,
          );
        },
      ),
    );
  }
}

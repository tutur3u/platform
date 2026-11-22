import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextButton, TextField;
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/utils/login_email_mode.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart'
    show AuthMethodDivider;
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/features/auth/widgets/login_alternative_methods.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum _LoginStage { identify, otp, password }

class LoginPage extends StatefulWidget {
  const LoginPage({
    this.addAccountMode = false,
    this.otpSecurityCheck,
    super.key,
  });

  /// Challenge presentation seam; the configured-token guard still applies.
  @visibleForTesting
  final Future<String?> Function(BuildContext)? otpSecurityCheck;

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

  final _emailModePreference = LoginEmailModePreference();
  _LoginStage _stage = _LoginStage.identify;
  final _attempts = SecurityCheckAttempts.prewarmed();
  int _retryAfter = 0;
  Timer? _retryAfterTimer;
  Timer? _otpAvailabilityGraceTimer;
  bool _otpAvailabilityGraceExpired = false;
  bool _cancelAddAccountFailed = false;

  bool get _isOtpStage => _stage == _LoginStage.otp;
  bool get _isPasswordStage => _stage == _LoginStage.password;

  @override
  void initState() {
    super.initState();
    if (widget.addAccountMode) {
      final email = context.read<AuthCubit>().state.addAccountEmail;
      if (email != null) _emailController.text = email;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.addAccountMode) {
        context.read<AuthCubit>().setAddAccountFlow(enabled: true);
      }
    });
    _otpAvailabilityGraceTimer = Timer(_otpAvailabilityGracePeriod, () {
      if (!mounted) return;
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

  ({bool isResolving, bool otpEnabled}) _otpAvailability(BuildContext context) {
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
    _attempts.cancel();
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
    _attempts.cancel();
    setState(() => _stage = _LoginStage.password);
    Future<void>.delayed(const Duration(milliseconds: 180), () {
      if (mounted && _isPasswordStage) {
        _passwordFocusNode.requestFocus();
      }
    });
  }

  void _showIdentifyStage() {
    context.read<AuthCubit>().clearError();
    _attempts.cancel();
    _stopRetryAfterTimer();
    setState(() {
      _stage = _LoginStage.identify;
      _retryAfter = 0;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _emailFocusNode.requestFocus();
      }
    });
  }

  void _chooseEmailMode(LoginEmailMode mode) {
    _emailModePreference.choose(_emailController.text, mode);
    if (mode == LoginEmailMode.password) {
      _showPasswordStage();
    } else if (_retryAfter > 0) {
      _showOtpStage(clearOtp: false, retryAfter: _retryAfter);
    } else {
      unawaited(_handleSendOtp());
    }
  }

  void _continueWithEmail({
    required bool otpEnabled,
    required bool isResolving,
  }) {
    if (isResolving) return;
    if (_emailModePreference.resolve(
          _emailController.text,
          otpEnabled: otpEnabled,
        ) ==
        LoginEmailMode.password) {
      _showPasswordStage();
    } else {
      unawaited(_handleSendOtp());
    }
  }

  Future<void> _handleSendOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      _emailFocusNode.requestFocus();
      return;
    }
    // Replaces a pending password submit; an edited email drops the send.
    await _attempts.run(
      verify: () => (widget.otpSecurityCheck ?? showSecurityCheck)(context),
      stillCurrent: () => _entered(email),
      submit: (captcha) => _sendOtp(email, captcha),
    );
  }

  /// Whether this page is in front and still shows what a submit read.
  bool _entered(String email, [String? password]) =>
      mounted &&
      (ModalRoute.isCurrentOf(context) ?? true) &&
      _emailController.text.trim() == email &&
      (password == null || _passwordController.text == password);

  Future<void> _sendOtp(String email, String? captcha) async {
    final result = await context.read<AuthCubit>().sendOtp(
      email,
      captchaToken: captcha,
    );
    if (!mounted) return;
    final retryAfter = result.success ? 0 : result.retryAfter ?? 0;
    if (result.success || retryAfter > 0) {
      // Show the address the code went to, even if the field changed since.
      _emailController.text = email;
      _showOtpStage(clearOtp: result.success, retryAfter: retryAfter);
    } else {
      _stopRetryAfterTimer();
      setState(() => _retryAfter = 0);
    }
  }

  Future<void> _handleVerifyOtp() async {
    final email = _emailController.text.trim();
    final otp = _otpController.text.trim();
    if (email.isEmpty || otp.length < 6) return;
    _attempts.cancel(); // A resend waiting on its check must not overlap.
    await context.read<AuthCubit>().verifyOtp(email, otp);
  }

  Future<void> _handlePasswordLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) return;
    await _attempts.run(
      verify: () => showSecurityCheck(context),
      stillCurrent: () => _isPasswordStage && _entered(email, password),
      submit: (captcha) => context.read<AuthCubit>().signInWithPassword(
        email,
        password,
        captchaToken: captcha,
      ),
    );
  }

  void _leave(String route) {
    _attempts.cancel(); // A submit still waiting on its check is dropped.
    unawaited(context.push<void>(route));
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
    _attempts.suspend(); // No sign-in may start or land mid-cancel.
    final ok = await context.read<AuthCubit>().cancelAddAccountFlow();
    if (!ok) _attempts.resume();
    if (mounted && !ok) setState(() => _cancelAddAccountFailed = true);
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
            LoginSocialSection(
              onGoogle: context.read<AuthCubit>().signInWithGoogle,
              onApple: context.read<AuthCubit>().signInWithApple,
              onGithub: context.read<AuthCubit>().signInWithGithub,
            ),
            const shad.Gap(24),
            AuthMethodDivider(label: l10n.authContinueWithQr),
            const shad.Gap(18),
            LoginQrSection(onPressed: () => _leave(Routes.qrLogin)),
          ],
          BlocBuilder<AuthCubit, AuthState>(
            builder: (context, state) {
              final errorText =
                  resolveAuthErrorMessage(
                    l10n: l10n,
                    error: state.error,
                    errorCode: state.errorCode,
                  ) ??
                  (_cancelAddAccountFailed && widget.addAccountMode
                      ? l10n.authSwitchAccountFailed
                      : null);
              final shouldHideCooldownError =
                  (_stage == _LoginStage.otp && _retryAfter > 0) ||
                  (_stage != _LoginStage.identify &&
                      _isOtpCooldownError(state.error));
              if (errorText == null || shouldHideCooldownError) {
                return const SizedBox.shrink();
              }
              return Padding(
                padding: const EdgeInsets.only(top: 16),
                child: AuthErrorNotice(
                  message: errorText,
                  errorCode: state.errorCode,
                  isLoading: state.isLoading,
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
                selectionControls: platformTextSelectionControls(),
                contextMenuBuilder: platformTextContextMenuBuilder(),
                key: const shad.FormKey<String>(#loginEmail),
                controller: _emailController,
                focusNode: _emailFocusNode,
                placeholder: Text(context.l10n.emailLabel),
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _continueWithEmail(
                  otpEnabled: otpEnabled,
                  isResolving: isResolvingOtpEnablement,
                ),
              ),
              const shad.Gap(16),
              AuthPrimaryButton(
                label: context.l10n.loginContinueWithEmail,
                onPressed:
                    isResolvingOtpEnablement ||
                        _emailController.text.trim().isEmpty
                    ? null
                    : () => _continueWithEmail(
                        otpEnabled: otpEnabled,
                        isResolving: isResolvingOtpEnablement,
                      ),
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
              const shad.Gap(10),
              AuthSecondaryButton(
                variant: AuthSecondaryButtonVariant.ghost,
                onPressed: state.isLoading
                    ? null
                    : ((otpEnabled && _retryAfter <= 0)
                          ? _handleSendOtp
                          : null),
                label: _retryAfter > 0
                    ? context.l10n.loginRetryIn(_retryAfter)
                    : context.l10n.loginResendOtp,
              ),
              const shad.Gap(6),
              AuthSecondaryButton(
                variant: AuthSecondaryButtonVariant.ghost,
                onPressed: state.isLoading
                    ? null
                    : () => _chooseEmailMode(LoginEmailMode.password),
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
                  selectionControls: platformTextSelectionControls(),
                  contextMenuBuilder: platformTextContextMenuBuilder(),
                  controller: _passwordController,
                  focusNode: _passwordFocusNode,
                  placeholder: Text(context.l10n.passwordLabel),
                  obscureText: true,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _handlePasswordLogin(),
                  features: const [shad.InputFeature.passwordToggle()],
                ),
              ),
              const shad.Gap(8),
              Align(
                alignment: Alignment.centerRight,
                child: shad.GhostButton(
                  onPressed: () => _leave('/forgot-password'),
                  child: Text(context.l10n.loginForgotPassword),
                ),
              ),
              const shad.Gap(8),
              AuthPrimaryButton(
                label: context.l10n.loginSignIn,
                onPressed: _handlePasswordLogin,
                isLoading: state.isLoading,
              ),
              if (otpEnabled) ...[
                const shad.Gap(10),
                AuthSecondaryButton(
                  variant: AuthSecondaryButtonVariant.ghost,
                  onPressed: state.isLoading
                      ? null
                      : () => _chooseEmailMode(LoginEmailMode.otp),
                  label: context.l10n.loginUseOtpInstead,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

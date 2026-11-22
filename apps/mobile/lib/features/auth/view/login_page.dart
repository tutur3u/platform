import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/utils/login_email_mode.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_legal_footer.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/login_stage_bodies.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';
import 'package:mobile/l10n/l10n.dart';

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
  bool _obscurePassword = true;

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

  Widget _errorNotice() => BlocBuilder<AuthCubit, AuthState>(
    builder: (context, state) {
      final l10n = context.l10n;
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
          (_stage != _LoginStage.identify && _isOtpCooldownError(state.error));
      if (errorText == null || shouldHideCooldownError) {
        return const SizedBox.shrink();
      }
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.md),
        child: AuthErrorNotice(
          message: errorText,
          errorCode: state.errorCode,
          isLoading: state.isLoading,
        ),
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    final otpAvailability = _otpAvailability(context);
    final otpEnabled = otpAvailability.otpEnabled;
    final isResolvingOtpEnablement =
        otpAvailability.isResolving && !_otpAvailabilityGraceExpired;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    final page = BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) => AnimatedSwitcher(
        duration: reduceMotion ? Duration.zero : _stepTransitionDuration,
        reverseDuration: reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 220),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.04),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        ),
        child: KeyedSubtree(
          key: ValueKey(_stage.name),
          child: switch (_stage) {
            _LoginStage.identify => _identifyStep(
              state,
              otpEnabled: otpEnabled,
              isResolving: isResolvingOtpEnablement,
            ),
            _LoginStage.otp => _otpStep(state, otpEnabled: otpEnabled),
            _LoginStage.password => _passwordStep(
              state,
              otpEnabled: otpEnabled,
            ),
          },
        ),
      ),
    );
    if (!widget.addAccountMode) {
      return page;
    }
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          return;
        }
        unawaited(_onCancelAddAccount());
      },
      child: page,
    );
  }

  Widget _identifyStep(
    AuthState state, {
    required bool otpEnabled,
    required bool isResolving,
  }) {
    final l10n = context.l10n;
    final cubit = context.read<AuthCubit>();
    final adding = widget.addAccountMode;
    return AuthScaffold(
      hero: const AuthHeroBand(),
      title: adding ? l10n.authAddAccountTitle : l10n.loginWelcomeTitle,
      subtitle: Text(
        adding ? l10n.authAddAccountHint : l10n.loginWelcomeSubtitle,
      ),
      showBackButton: adding,
      backButtonLabel: adding ? l10n.navHome : null,
      onBack: adding ? () => unawaited(_onCancelAddAccount()) : null,
      footer: const AuthLegalFooter(),
      child: LoginIdentifyBody(
        emailController: _emailController,
        emailFocusNode: _emailFocusNode,
        busy: state.isLoading,
        resolving: isResolving,
        onEmailChanged: (_) => setState(() {}),
        onContinue: isResolving || _emailController.text.trim().isEmpty
            ? null
            : () => _continueWithEmail(
                otpEnabled: otpEnabled,
                isResolving: isResolving,
              ),
        onGoogle: () => unawaited(cubit.signInWithGoogle()),
        onApple: () => unawaited(cubit.signInWithApple()),
        onGithub: () => unawaited(cubit.signInWithGithub()),
        onQr: () => _leave(Routes.qrLogin),
        error: _errorNotice(),
      ),
    );
  }

  Widget _sentTo() {
    final email = _emailController.text.trim();
    final template = context.l10n.loginCodeSentTo('\u0001');
    final at = template.indexOf('\u0001');
    final bold = TextStyle(
      fontWeight: FontWeight.w700,
      color: AppTokens.of(context).colorScheme.foreground,
    );
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: template.substring(0, at)),
          TextSpan(text: email, style: bold),
          TextSpan(text: template.substring(at + 1)),
        ],
      ),
    );
  }

  Widget _otpStep(AuthState state, {required bool otpEnabled}) {
    final l10n = context.l10n;
    final busy = state.isLoading;
    return AuthScaffold(
      showBackButton: true,
      backButtonLabel: l10n.loginOtherWays,
      onBack: busy ? null : _showIdentifyStage,
      illustration: AppIllustrationKind.emailCode,
      title: l10n.loginCheckEmailTitle,
      subtitle: _sentTo(),
      bottomAction: AuthPrimaryButton(
        label: l10n.loginVerifyOtp,
        onPressed: busy || _otpController.text.trim().length != 6
            ? null
            : _handleVerifyOtp,
        isLoading: busy,
      ),
      child: LoginOtpBody(
        otpController: _otpController,
        otpFocusNode: _otpFocusNode,
        busy: busy,
        retryAfter: _retryAfter,
        onOtpChanged: (_) => setState(() {}),
        onCompleted: (_) => _handleVerifyOtp(),
        onResend: otpEnabled && _retryAfter <= 0 ? _handleSendOtp : null,
        onUsePassword: () => _chooseEmailMode(LoginEmailMode.password),
        error: _errorNotice(),
      ),
    );
  }

  Widget _passwordStep(AuthState state, {required bool otpEnabled}) {
    final l10n = context.l10n;
    final busy = state.isLoading;
    return AuthScaffold(
      showBackButton: true,
      backButtonLabel: l10n.loginOtherWays,
      onBack: busy ? null : _showIdentifyStage,
      title: l10n.loginPasswordTitle,
      subtitle: Text(_emailController.text.trim()),
      bottomAction: AuthPrimaryButton(
        label: l10n.loginSignIn,
        onPressed: _handlePasswordLogin,
        isLoading: busy,
      ),
      child: LoginPasswordBody(
        passwordController: _passwordController,
        passwordFocusNode: _passwordFocusNode,
        obscure: _obscurePassword,
        onToggleObscure: () =>
            setState(() => _obscurePassword = !_obscurePassword),
        onSubmitted: _handlePasswordLogin,
        onForgotPassword: () => _leave('/forgot-password'),
        onUseOtp: otpEnabled
            ? () => _chooseEmailMode(LoginEmailMode.otp)
            : null,
        busy: busy,
        error: _errorNotice(),
      ),
    );
  }
}

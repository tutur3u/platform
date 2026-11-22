import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/l10n/l10n.dart';

/// Presentation of the three login steps. `LoginPage` owns every controller,
/// timer and auth call and passes them in; nothing here talks to the cubit.

/// Email, Continue, then the other providers.
class LoginIdentifyBody extends StatelessWidget {
  const LoginIdentifyBody({
    required this.emailController,
    required this.emailFocusNode,
    required this.busy,
    required this.resolving,
    required this.onEmailChanged,
    required this.onContinue,
    required this.onGoogle,
    required this.onApple,
    required this.onGithub,
    required this.onQr,
    this.error,
    super.key,
  });

  final TextEditingController emailController;
  final FocusNode emailFocusNode;

  /// A sign-in is running; every method waits.
  final bool busy;

  /// Whether email codes are on is still resolving; only Continue waits.
  final bool resolving;
  final ValueChanged<String> onEmailChanged;

  /// Null while the email is empty or the step cannot continue yet.
  final VoidCallback? onContinue;
  final VoidCallback onGoogle;
  final VoidCallback onApple;
  final VoidCallback onGithub;
  final VoidCallback onQr;
  final Widget? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          key: const ValueKey('login-email'),
          selectionControls: platformTextSelectionControls(),
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: emailController,
          focusNode: emailFocusNode,
          placeholder: l10n.loginEmailPlaceholder,
          leading: const Icon(LucideIcons.mail, size: 18),
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          autocorrect: false,
          enableSuggestions: false,
          autofillHints: const [AutofillHints.email],
          onChanged: onEmailChanged,
          onSubmitted: (_) => onContinue?.call(),
        ),
        const AppGap(AppSpacing.md),
        AuthPrimaryButton(
          label: l10n.loginContinue,
          onPressed: onContinue,
          isLoading: busy || resolving,
        ),
        ?error,
        const AppGap(AppSpacing.lg),
        AuthMethodDivider(label: l10n.authContinueWithQr),
        const AppGap(AppSpacing.lg),
        AuthSocialButtons(
          isLoading: busy,
          onGooglePressed: onGoogle,
          onApplePressed: onApple,
          onGithubPressed: onGithub,
          onQrPressed: onQr,
        ),
      ],
    );
  }
}

/// The 6-digit code, resend countdown and the switch to password.
class LoginOtpBody extends StatelessWidget {
  const LoginOtpBody({
    required this.otpController,
    required this.otpFocusNode,
    required this.busy,
    required this.retryAfter,
    required this.onOtpChanged,
    required this.onCompleted,
    required this.onResend,
    required this.onUsePassword,
    this.error,
    super.key,
  });

  final TextEditingController otpController;
  final FocusNode otpFocusNode;
  final bool busy;

  /// Seconds until another code can be sent; 0 when it can.
  final int retryAfter;
  final ValueChanged<String> onOtpChanged;
  final ValueChanged<String> onCompleted;

  /// Null when resending is unavailable.
  final VoidCallback? onResend;
  final VoidCallback? onUsePassword;
  final Widget? error;

  static String clock(int seconds) =>
      '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final small = tokens.typography.caption.copyWith(color: c.mutedForeground);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (retryAfter > 0) ...[
          Text(
            l10n.loginOtpRateLimitedInstruction(retryAfter),
            textAlign: TextAlign.center,
            style: small,
          ),
          const AppGap(AppSpacing.md),
        ],
        Center(
          child: AuthOtpField(
            controller: otpController,
            focusNode: otpFocusNode,
            enabled: !busy,
            autofocus: true,
            semanticLabel: l10n.mfaCodeLabel,
            onChanged: onOtpChanged,
            onCompleted: onCompleted,
          ),
        ),
        ?error,
        const AppGap(AppSpacing.sm),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpacing.sm,
          children: [
            if (retryAfter > 0)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Text(
                  l10n.loginResendIn(clock(retryAfter)),
                  style: small.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              )
            else
              AppButton(
                variant: AppButtonVariant.link,
                onPressed: busy ? null : onResend,
                child: Text(l10n.loginResendOtp),
              ),
            AppButton(
              variant: AppButtonVariant.link,
              onPressed: busy ? null : onUsePassword,
              child: Text(l10n.loginUsePassword),
            ),
          ],
        ),
      ],
    );
  }
}

/// Password with a show toggle, the forgot link and the switch to a code.
class LoginPasswordBody extends StatelessWidget {
  const LoginPasswordBody({
    required this.passwordController,
    required this.passwordFocusNode,
    required this.obscure,
    required this.onToggleObscure,
    required this.onSubmitted,
    required this.onForgotPassword,
    required this.onUseOtp,
    this.busy = false,
    this.error,
    super.key,
  });

  final TextEditingController passwordController;
  final FocusNode passwordFocusNode;
  final bool obscure;
  final VoidCallback onToggleObscure;
  final VoidCallback onSubmitted;
  final VoidCallback onForgotPassword;

  /// Null when email codes are off.
  final VoidCallback? onUseOtp;

  /// Disables the step switch while a sign-in runs.
  final bool busy;
  final Widget? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          key: const ValueKey('login-password'),
          selectionControls: platformTextSelectionControls(),
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: passwordController,
          focusNode: passwordFocusNode,
          label: l10n.passwordLabel,
          placeholder: l10n.passwordLabel,
          obscureText: obscure,
          autocorrect: false,
          enableSuggestions: false,
          autofillHints: const [AutofillHints.password],
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => onSubmitted(),
          trailing: AppIconButton(
            icon: Icon(
              obscure ? LucideIcons.eye : LucideIcons.eyeOff,
              size: 18,
            ),
            tooltip: obscure ? l10n.authShowPassword : l10n.authHidePassword,
            onPressed: onToggleObscure,
          ),
        ),
        ?error,
        const AppGap(AppSpacing.xs),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpacing.sm,
          children: [
            AppButton(
              variant: AppButtonVariant.link,
              onPressed: onForgotPassword,
              child: Text(l10n.loginForgotPassword),
            ),
            if (onUseOtp case final useOtp?)
              AppButton(
                variant: AppButtonVariant.link,
                onPressed: busy ? null : useOtp,
                child: Text(l10n.loginUseOtpInstead),
              ),
          ],
        ),
      ],
    );
  }
}

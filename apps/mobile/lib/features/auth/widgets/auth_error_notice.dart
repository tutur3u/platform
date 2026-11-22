import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// A one-line error under a field, announced when it appears.
class AuthInlineError extends StatelessWidget {
  const AuthInlineError(this.message, {this.centered = true, super.key});

  final String message;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final ink = tokens.colorScheme.destructive;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: centered
            ? MainAxisAlignment.center
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(LucideIcons.circleAlert, size: 14, color: ink),
          ),
          const SizedBox(width: AppSpacing.sm - 2),
          Flexible(
            child: Text(
              message,
              textAlign: centered ? TextAlign.center : TextAlign.start,
              style: tokens.typography.caption.copyWith(color: ink),
            ),
          ),
        ],
      ),
    );
  }
}

/// Inline auth error with a Retry action for provider sign-in failures.
class AuthErrorNotice extends StatelessWidget {
  const AuthErrorNotice({
    required this.message,
    this.errorCode,
    this.isLoading = false,
    super.key,
  });

  final String message;
  final AuthErrorCode? errorCode;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final retry = _retryAction(context.read<AuthCubit>(), errorCode);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AuthInlineError(message),
        if (retry != null) ...[
          const AppGap(AppSpacing.sm),
          AppButton.outline(
            size: AppButtonSize.small,
            onPressed: isLoading ? null : retry,
            child: Text(context.l10n.commonRetry),
          ),
        ],
      ],
    );
  }

  static VoidCallback? _retryAction(AuthCubit cubit, AuthErrorCode? code) {
    return switch (code) {
      AuthErrorCode.googleSignInFailed ||
      AuthErrorCode.googleBrowserLaunchFailed => cubit.signInWithGoogle,
      AuthErrorCode.appleSignInFailed ||
      AuthErrorCode.appleBrowserLaunchFailed => cubit.signInWithApple,
      AuthErrorCode.githubBrowserLaunchFailed => cubit.signInWithGithub,
      AuthErrorCode.microsoftBrowserLaunchFailed || null => null,
    };
  }
}

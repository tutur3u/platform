import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

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
    final tokens = AppTokens.of(context);
    final retry = _retryAction(context.read<AuthCubit>(), errorCode);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          message,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.destructive,
          ),
          textAlign: TextAlign.center,
        ),
        if (retry != null) ...[
          const AppGap(8),
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

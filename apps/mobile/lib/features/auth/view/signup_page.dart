import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/features/auth/widgets/auth_legal_footer.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/l10n/l10n.dart';

class SignUpPage extends StatelessWidget {
  const SignUpPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<AuthCubit>();

    return AuthScaffold(
      showBackButton: true,
      backButtonLabel: l10n.navBack,
      hero: const AuthHeroBand(),
      title: l10n.signUpTitle,
      subtitle: Text(l10n.signUpSubtitle),
      footer: const AuthLegalFooter(),
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) =>
            prev.isLoading != curr.isLoading ||
            prev.error != curr.error ||
            prev.errorCode != curr.errorCode,
        builder: (context, state) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AuthSocialButtons(
                isLoading: state.isLoading,
                onGooglePressed: () => unawaited(cubit.signInWithGoogle()),
                onApplePressed: () => unawaited(cubit.signInWithApple()),
                onGithubPressed: () => unawaited(cubit.signInWithGithub()),
              ),
              if (resolveAuthErrorMessage(
                    l10n: l10n,
                    error: state.error,
                    errorCode: state.errorCode,
                  )
                  case final errorText?) ...[
                const AppGap(AppSpacing.lg),
                AuthErrorNotice(
                  message: errorText,
                  errorCode: state.errorCode,
                  isLoading: state.isLoading,
                ),
              ],
              const AppGap(AppSpacing.md),
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    l10n.signUpAlreadyHaveAccountPrompt,
                    style: AppTokens.of(context).typography.bodySm.copyWith(
                      color: AppTokens.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                  AppButton(
                    variant: AppButtonVariant.link,
                    onPressed: () => context.go('/login'),
                    child: Text(l10n.signUpSignIn),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

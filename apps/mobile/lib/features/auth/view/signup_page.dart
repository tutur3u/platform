import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SignUpPage extends StatelessWidget {
  const SignUpPage({super.key});

  Future<void> _handleGoogleSignIn(BuildContext context) {
    return context.read<AuthCubit>().signInWithGoogle();
  }

  Future<void> _handleAppleSignIn(BuildContext context) {
    return context.read<AuthCubit>().signInWithApple();
  }

  Future<void> _handleMicrosoftSignIn(BuildContext context) {
    return context.read<AuthCubit>().signInWithMicrosoft();
  }

  Future<void> _handleGithubSignIn(BuildContext context) {
    return context.read<AuthCubit>().signInWithGithub();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AuthScaffold(
      showBackButton: true,
      title: l10n.signUpTitle,
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) =>
            prev.isLoading != curr.isLoading ||
            prev.error != curr.error ||
            prev.errorCode != curr.errorCode,
        builder: (context, state) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.signUpSubtitle,
                style: theme.typography.textMuted,
                textAlign: TextAlign.center,
              ),
              const shad.Gap(24),
              AuthSectionCard(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
                child: AuthSocialButtons(
                  isLoading: state.isLoading,
                  onGooglePressed: () => _handleGoogleSignIn(context),
                  onMicrosoftPressed: () => _handleMicrosoftSignIn(context),
                  onApplePressed: () => _handleAppleSignIn(context),
                  onGithubPressed: () => _handleGithubSignIn(context),
                ),
              ),
              if (resolveAuthErrorMessage(
                    l10n: l10n,
                    error: state.error,
                    errorCode: state.errorCode,
                  ) !=
                  null) ...[
                const shad.Gap(16),
                Text(
                  resolveAuthErrorMessage(
                    l10n: l10n,
                    error: state.error,
                    errorCode: state.errorCode,
                  )!,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.destructive,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const shad.Gap(16),
              Center(
                child: GestureDetector(
                  onTap: () => context.go('/login'),
                  child: RichText(
                    text: TextSpan(
                      style: theme.typography.p,
                      children: [
                        TextSpan(
                          text: '${l10n.signUpAlreadyHaveAccountPrompt} ',
                          style: theme.typography.textMuted,
                        ),
                        TextSpan(
                          text: l10n.signUpSignIn,
                          style: TextStyle(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

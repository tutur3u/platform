import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/l10n/l10n.dart';

class LoginSocialSection extends StatelessWidget {
  const LoginSocialSection({
    required this.onGoogle,
    required this.onMicrosoft,
    required this.onApple,
    required this.onGithub,
    super.key,
  });

  final Future<void> Function() onGoogle;
  final Future<void> Function() onMicrosoft;
  final Future<void> Function() onApple;
  final Future<void> Function() onGithub;

  @override
  Widget build(BuildContext context) => AuthSectionCard(
    padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
    child: BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) => AuthSocialButtons(
        isLoading: state.isLoading,
        onGooglePressed: onGoogle,
        onMicrosoftPressed: onMicrosoft,
        onApplePressed: onApple,
        onGithubPressed: onGithub,
      ),
    ),
  );
}

class LoginQrSection extends StatelessWidget {
  const LoginQrSection({required this.onPressed, super.key});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => AuthSectionCard(
    padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
    child: BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) => AuthSecondaryButton(
        label: context.l10n.qrLoginMobileButton,
        isLoading: state.isLoading,
        onPressed: onPressed,
        leading: const Icon(Icons.qr_code_2_rounded, size: 20),
      ),
    ),
  );
}

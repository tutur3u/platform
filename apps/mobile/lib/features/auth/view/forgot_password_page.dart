import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _emailController = TextEditingController();
  final _formKey = const shad.FormKey<String>(#forgotPasswordForm);
  bool _emailSent = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;

    final success = await context.read<AuthCubit>().resetPassword(email);
    if (success && mounted) {
      setState(() => _emailSent = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    if (_emailSent) {
      return AuthScaffold(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
              ),
              child: Icon(
                LucideIcons.mailCheck,
                size: 48,
                color: theme.colorScheme.primary,
              ),
            ),
            const shad.Gap(24),
            Text(
              l10n.forgotPasswordSentTitle,
              style: theme.typography.h3,
              textAlign: TextAlign.center,
            ),
            const shad.Gap(8),
            Text(
              l10n.forgotPasswordSentMessage,
              style: theme.typography.lead.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontSize: 16,
              ),
              textAlign: TextAlign.center,
            ),
            const shad.Gap(32),
            AuthPrimaryButton(
              label: l10n.forgotPasswordBackToLogin,
              onPressed: () => context.go('/login'),
            ),
          ],
        ),
      );
    }

    return AuthScaffold(
      showBackButton: true,
      title: l10n.forgotPasswordTitle,
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) =>
            prev.isLoading != curr.isLoading || prev.error != curr.error,
        builder: (context, state) {
          return shad.Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.forgotPasswordDescription,
                  style: theme.typography.textMuted.copyWith(fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(32),
                shad.FormField(
                  key: const shad.FormKey<String>(#forgotPasswordEmail),
                  label: Text(l10n.emailLabel),
                  child: shad.TextField(
                    controller: _emailController,
                    placeholder: Text(l10n.emailLabel),
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _handleSubmit(),
                  ),
                ),
                if (state.error != null) ...[
                  const shad.Gap(16),
                  Text(
                    state.error!,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.destructive,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                const shad.Gap(32),
                AuthPrimaryButton(
                  label: l10n.forgotPasswordSendReset,
                  onPressed: _handleSubmit,
                  isLoading: state.isLoading,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

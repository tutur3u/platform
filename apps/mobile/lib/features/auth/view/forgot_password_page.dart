import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _emailController = TextEditingController();
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

    if (_emailSent) {
      return shad.Scaffold(
        headers: [
          shad.AppBar(
            leading: [
              shad.OutlineButton(
                density: shad.ButtonDensity.icon,
                onPressed: () => context.go('/login'),
                child: const Icon(Icons.arrow_back),
              ),
            ],
          ),
        ],
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.mark_email_read_outlined,
                  size: 64,
                  color: shad.Theme.of(context).colorScheme.primary,
                ),
                const shad.Gap(16),
                Text(
                  l10n.forgotPasswordSentTitle,
                  style: shad.Theme.of(context).typography.h3,
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(8),
                Text(
                  l10n.forgotPasswordSentMessage,
                  style: shad.Theme.of(context).typography.p,
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(24),
                shad.PrimaryButton(
                  onPressed: () => context.go('/login'),
                  child: Text(l10n.forgotPasswordBackToLogin),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: Text(l10n.forgotPasswordTitle),
        ),
      ],
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: BlocBuilder<AuthCubit, AuthState>(
            buildWhen: (prev, curr) =>
                prev.isLoading != curr.isLoading || prev.error != curr.error,
            builder: (context, state) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const shad.Gap(32),
                  Text(
                    l10n.forgotPasswordDescription,
                    style: shad.Theme.of(context).typography.p,
                  ),
                  const shad.Gap(24),
                  shad.FormField(
                    key: const shad.FormKey<String>(#forgotPasswordEmail),
                    label: Text(l10n.emailLabel),
                    child: shad.TextField(
                      controller: _emailController,
                      hintText: l10n.emailLabel,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _handleSubmit(),
                    ),
                  ),
                  if (state.error != null) ...[
                    const shad.Gap(16),
                    Text(
                      state.error!,
                      style: TextStyle(
                        color: shad.Theme.of(context).colorScheme.destructive,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const shad.Gap(24),
                  shad.PrimaryButton(
                    onPressed: state.isLoading ? null : _handleSubmit,
                    child: state.isLoading
                        ? const shad.CircularProgressIndicator(size: 20)
                        : Text(l10n.forgotPasswordSendReset),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

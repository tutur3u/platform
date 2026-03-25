import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SignUpPage extends StatefulWidget {
  const SignUpPage({super.key});

  @override
  State<SignUpPage> createState() => _SignUpPageState();
}

class _SignUpPageState extends State<SignUpPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _emailFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();
  final _confirmPasswordFocusNode = FocusNode();
  final _formKey = const shad.FormKey<String>(#signUpForm);
  bool _signUpSuccess = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
    _confirmPasswordFocusNode.dispose();
    super.dispose();
  }

  Future<void> _handleSignUp() async {
    // Basic validation
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmPasswordController.text;

    if (email.isEmpty || password.isEmpty) return;
    if (password != confirm) {
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.signUpPasswordMismatch),
        ),
      );
      return;
    }

    final success = await context.read<AuthCubit>().signUp(email, password);
    if (success && mounted) {
      setState(() => _signUpSuccess = true);
    }
  }

  Future<void> _handleGoogleSignIn() {
    return context.read<AuthCubit>().signInWithGoogle();
  }

  Future<void> _handleAppleSignIn() {
    return context.read<AuthCubit>().signInWithApple();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    if (_signUpSuccess) {
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
              l10n.signUpSuccessTitle,
              style: theme.typography.h3,
              textAlign: TextAlign.center,
            ),
            const shad.Gap(8),
            Text(
              l10n.signUpSuccessMessage,
              style: theme.typography.lead.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontSize: 16,
              ),
              textAlign: TextAlign.center,
            ),
            const shad.Gap(32),
            SizedBox(
              width: double.infinity,
              child: shad.PrimaryButton(
                onPressed: () => context.go('/login'),
                child: Center(child: Text(l10n.signUpBackToLogin)),
              ),
            ),
          ],
        ),
      );
    }

    return AuthScaffold(
      showBackButton: true,
      title: l10n.signUpTitle,
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
                  l10n.signUpSubtitle,
                  style: theme.typography.textMuted,
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(20),
                AuthAppleButton(
                  isLoading: state.isLoading,
                  onPressed: _handleAppleSignIn,
                ),
                const shad.Gap(12),
                AuthGoogleButton(
                  isLoading: state.isLoading,
                  onPressed: _handleGoogleSignIn,
                ),
                const shad.Gap(20),
                const AuthMethodDivider(),
                const shad.Gap(20),
                shad.FormField(
                  key: const shad.FormKey<String>(#signUpEmail),
                  label: Text(l10n.emailLabel),
                  child: shad.TextField(
                    controller: _emailController,
                    focusNode: _emailFocusNode,
                    placeholder: Text(l10n.emailLabel),
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    onSubmitted: (_) => _passwordFocusNode.requestFocus(),
                  ),
                ),
                const shad.Gap(16),
                shad.FormField(
                  key: const shad.FormKey<String>(#signUpPassword),
                  label: Text(l10n.passwordLabel),
                  child: Column(
                    children: [
                      shad.TextField(
                        controller: _passwordController,
                        focusNode: _passwordFocusNode,
                        placeholder: Text(l10n.passwordLabel),
                        obscureText: true,
                        textInputAction: TextInputAction.next,
                        onChanged: (_) => setState(() {}),
                        onSubmitted: (_) =>
                            _confirmPasswordFocusNode.requestFocus(),
                      ),
                      const shad.Gap(8),
                      _PasswordStrengthIndicator(
                        password: _passwordController.text,
                      ),
                    ],
                  ),
                ),
                const shad.Gap(16),
                shad.FormField(
                  key: const shad.FormKey<String>(#signUpConfirmPassword),
                  label: Text(l10n.signUpConfirmPassword),
                  child: shad.TextField(
                    controller: _confirmPasswordController,
                    focusNode: _confirmPasswordFocusNode,
                    placeholder: Text(l10n.signUpConfirmPassword),
                    obscureText: true,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _handleSignUp(),
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
                const shad.Gap(24),
                SizedBox(
                  width: double.infinity,
                  child: shad.PrimaryButton(
                    onPressed: state.isLoading ? null : _handleSignUp,
                    child: state.isLoading
                        ? const Center(
                            child: shad.CircularProgressIndicator(size: 16),
                          )
                        : Center(child: Text(l10n.signUpButton)),
                  ),
                ),
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
            ),
          );
        },
      ),
    );
  }
}

class _PasswordStrengthIndicator extends StatelessWidget {
  const _PasswordStrengthIndicator({required this.password});

  final String password;

  @override
  Widget build(BuildContext context) {
    if (password.isEmpty) return const SizedBox.shrink();

    var strength = 0;
    if (password.length >= 8) strength++;
    if (password.contains(RegExp('[A-Z]'))) strength++;
    if (password.contains(RegExp('[0-9]'))) strength++;
    if (password.contains(RegExp(r'[!@#\$%^&*(),.?":{}|<>]'))) strength++;

    final color = switch (strength) {
      0 || 1 => Colors.red,
      2 => Colors.orange,
      3 => Colors.yellow,
      4 => Colors.green,
      _ => Colors.grey,
    };

    final label = switch (strength) {
      0 || 1 => 'Weak',
      2 => 'Fair',
      3 => 'Good',
      4 => 'Strong',
      _ => '',
    };

    return Row(
      children: [
        Expanded(
          child: Row(
            children: List.generate(4, (index) {
              return Expanded(
                child: Container(
                  height: 4,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    color: index < strength
                        ? color
                        : shad.Theme.of(context).colorScheme.muted,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          ),
        ),
        const shad.Gap(8),
        Text(
          label,
          style: shad.Theme.of(context).typography.small.copyWith(
            color: color,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }
}

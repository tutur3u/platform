import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailController = TextEditingController(
    text: Env.isDevelopment ? 'local@tuturuuu.com' : '',
  );
  final _passwordController = TextEditingController(
    text: Env.isDevelopment ? 'password123' : '',
  );

  String? _captchaToken;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handlePasswordLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) return;

    final captcha = _captchaToken;
    setState(() => _captchaToken = null);

    await context.read<AuthCubit>().signInWithPassword(
      email,
      password,
      captchaToken: captcha,
    );
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

    final hPadding = ResponsivePadding.horizontal(context.deviceClass);
    final maxFormW = ResponsivePadding.maxFormWidth(context.deviceClass);

    return shad.Scaffold(
      child: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxFormW),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: hPadding),
              child: Column(
                children: [
                  const shad.Gap(64),
                  Image.asset(
                    'assets/logos/transparent.png',
                    width: 64,
                    height: 64,
                  ),
                  const shad.Gap(24),
                  Text(
                    l10n.loginTitle,
                    style: shad.Theme.of(context).typography.h2,
                  ),
                  const shad.Gap(8),
                  Text(
                    l10n.loginSubtitle,
                    style: shad.Theme.of(context).typography.textMuted,
                  ),
                  const shad.Gap(32),
                  BlocBuilder<AuthCubit, AuthState>(
                    buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
                    builder: (context, state) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          AuthAppleButton(
                            isLoading: state.isLoading,
                            onPressed: _handleAppleSignIn,
                          ),
                          const shad.Gap(12),
                          AuthGoogleButton(
                            isLoading: state.isLoading,
                            onPressed: _handleGoogleSignIn,
                          ),
                        ],
                      );
                    },
                  ),
                  const shad.Gap(20),
                  const AuthMethodDivider(),
                  const shad.Gap(20),
                  Expanded(
                    child: _buildPasswordForm(),
                  ),
                  // Error display
                  BlocBuilder<AuthCubit, AuthState>(
                    buildWhen: (prev, curr) => prev.error != curr.error,
                    builder: (context, state) {
                      final errorText = resolveAuthErrorMessage(
                        l10n: l10n,
                        error: state.error,
                        errorCode: state.errorCode,
                      );
                      if (errorText == null) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(
                          errorText,
                          style: TextStyle(
                            color: shad.Theme.of(
                              context,
                            ).colorScheme.destructive,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      );
                    },
                  ),
                  shad.GhostButton(
                    onPressed: () => context.push('/signup'),
                    child: Text(l10n.loginSignUpPrompt),
                  ),
                  const shad.Gap(16),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPasswordForm() {
    return BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) {
        return SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              shad.FormField(
                key: const shad.FormKey<String>(#loginEmail),
                label: Text(context.l10n.emailLabel),
                child: shad.TextField(
                  controller: _emailController,
                  placeholder: Text(context.l10n.emailLabel),
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                ),
              ),
              const shad.Gap(16),
              shad.FormField(
                key: const shad.FormKey<String>(#loginPassword),
                label: Text(context.l10n.passwordLabel),
                child: shad.TextField(
                  controller: _passwordController,
                  placeholder: Text(context.l10n.passwordLabel),
                  obscureText: true,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _handlePasswordLogin(),
                  features: const [
                    shad.InputFeature.passwordToggle(),
                  ],
                ),
              ),
              const shad.Gap(8),
              Align(
                alignment: Alignment.centerRight,
                child: shad.GhostButton(
                  onPressed: () => context.push('/forgot-password'),
                  child: Text(context.l10n.loginForgotPassword),
                ),
              ),
              const shad.Gap(8),
              if (Env.isTurnstileConfigured) ...[
                CloudflareTurnstile(
                  siteKey: Env.turnstileSiteKey,
                  baseUrl: Env.turnstileBaseUrl,
                  onTokenReceived: (token) {
                    setState(() => _captchaToken = token);
                  },
                ),
                const shad.Gap(8),
              ],
              SizedBox(
                width: double.infinity,
                child: shad.PrimaryButton(
                  onPressed:
                      state.isLoading ||
                          (Env.isTurnstileConfigured && _captchaToken == null)
                      ? null
                      : _handlePasswordLogin,
                  child: state.isLoading
                      ? const Center(
                          child: shad.CircularProgressIndicator(size: 20),
                        )
                      : Center(child: Text(context.l10n.loginSignIn)),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

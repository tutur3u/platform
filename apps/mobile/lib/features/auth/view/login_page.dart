import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_google_button.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  static const _stepTransitionDuration = Duration(milliseconds: 420);

  final _emailController = TextEditingController(
    text: Env.isDevelopment ? 'local@tuturuuu.com' : '',
  );
  final _passwordController = TextEditingController(
    text: Env.isDevelopment ? 'password123' : '',
  );
  final _emailFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();

  bool _showPasswordStep = false;
  String? _captchaToken;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
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

  Future<void> _handleMicrosoftSignIn() {
    return context.read<AuthCubit>().signInWithMicrosoft();
  }

  Future<void> _handleGithubSignIn() {
    return context.read<AuthCubit>().signInWithGithub();
  }

  void _showPasswordStepPanel() {
    if (_emailController.text.trim().isEmpty) {
      _emailFocusNode.requestFocus();
      return;
    }

    setState(() => _showPasswordStep = true);
    Future<void>.delayed(const Duration(milliseconds: 180), () {
      if (mounted && _showPasswordStep) {
        _passwordFocusNode.requestFocus();
      }
    });
  }

  void _hidePasswordStepPanel() {
    setState(() => _showPasswordStep = false);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _emailFocusNode.requestFocus();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AuthScaffold(
      title: l10n.loginTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AnimatedSwitcher(
            duration: _stepTransitionDuration,
            reverseDuration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) {
              return FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.04),
                    end: Offset.zero,
                  ).animate(animation),
                  child: child,
                ),
              );
            },
            child: KeyedSubtree(
              key: ValueKey(_showPasswordStep ? 'password' : 'email'),
              child: _showPasswordStep
                  ? _buildPasswordSection()
                  : _buildEmailSection(),
            ),
          ),
          if (!_showPasswordStep) ...[
            const shad.Gap(24),
            AuthMethodDivider(
              label: l10n.authContinueWithSocial,
            ),
            const shad.Gap(18),
            _buildSocialSection(),
          ],
          BlocBuilder<AuthCubit, AuthState>(
            buildWhen: (prev, curr) =>
                prev.error != curr.error || prev.errorCode != curr.errorCode,
            builder: (context, state) {
              final errorText = resolveAuthErrorMessage(
                l10n: l10n,
                error: state.error,
                errorCode: state.errorCode,
              );
              if (errorText == null) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  errorText,
                  style: TextStyle(
                    color: theme.colorScheme.destructive,
                  ),
                  textAlign: TextAlign.center,
                ),
              );
            },
          ),
          const shad.Gap(20),
          Center(
            child: GestureDetector(
              onTap: () => context.push('/signup'),
              child: Text(
                l10n.loginSignUpPrompt,
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground.withValues(
                    alpha: 0.82,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmailSection() {
    return AuthSectionCard(
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
        builder: (context, state) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              shad.TextField(
                key: const shad.FormKey<String>(#loginEmail),
                controller: _emailController,
                focusNode: _emailFocusNode,
                placeholder: Text(context.l10n.emailLabel),
                keyboardType: TextInputType.emailAddress,
                textInputAction: _showPasswordStep
                    ? TextInputAction.next
                    : TextInputAction.done,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _showPasswordStepPanel(),
              ),
              const shad.Gap(16),
              AuthPrimaryButton(
                label: context.l10n.loginContinueWithEmail,
                onPressed: _emailController.text.trim().isEmpty
                    ? null
                    : _showPasswordStepPanel,
                isLoading: state.isLoading,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildPasswordSection() {
    return AuthSectionCard(
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
        builder: (context, state) {
          final theme = shad.Theme.of(context);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: shad.GhostButton(
                  onPressed: state.isLoading ? null : _hidePasswordStepPanel,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.arrow_back, size: 18),
                      const shad.Gap(8),
                      Text(context.l10n.navBack),
                    ],
                  ),
                ),
              ),
              const shad.Gap(8),
              Text(
                _emailController.text.trim(),
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const shad.Gap(16),
              shad.FormField(
                key: const shad.FormKey<String>(#loginPassword),
                label: Text(context.l10n.passwordLabel),
                child: shad.TextField(
                  controller: _passwordController,
                  focusNode: _passwordFocusNode,
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
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 312),
                    child: CloudflareTurnstile(
                      siteKey: Env.turnstileSiteKey,
                      baseUrl: Env.turnstileBaseUrl,
                      options: TurnstileOptions(
                        size: TurnstileSize.flexible,
                        theme: theme.brightness == Brightness.dark
                            ? TurnstileTheme.dark
                            : TurnstileTheme.light,
                      ),
                      onTokenReceived: (token) {
                        setState(() => _captchaToken = token);
                      },
                    ),
                  ),
                ),
                const shad.Gap(8),
              ],
              AuthPrimaryButton(
                label: context.l10n.loginSignIn,
                onPressed: (Env.isTurnstileConfigured && _captchaToken == null)
                    ? null
                    : _handlePasswordLogin,
                isLoading: state.isLoading,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSocialSection() {
    return AuthSectionCard(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
        builder: (context, state) {
          return AuthSocialButtons(
            isLoading: state.isLoading,
            onGooglePressed: _handleGoogleSignIn,
            onMicrosoftPressed: _handleMicrosoftSignIn,
            onApplePressed: _handleAppleSignIn,
            onGithubPressed: _handleGithubSignIn,
          );
        },
      ),
    );
  }
}

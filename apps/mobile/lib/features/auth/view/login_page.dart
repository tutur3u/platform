import 'package:flutter/material.dart'
    hide
        AppBar,
        FilledButton,
        Scaffold,
        TabBar,
        TabBarView,
        TabController,
        TextButton,
        TextField;
import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _otpController = TextEditingController();

  int _index = 0;
  bool _otpSent = false;
  int _retryAfter = 0;
  String? _captchaToken;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _handleSendOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;
    if (Env.isTurnstileConfigured && _captchaToken == null) return;

    final captcha = _captchaToken;
    setState(() => _captchaToken = null);

    final cubit = context.read<AuthCubit>();
    final result = await cubit.sendOtp(email, captchaToken: captcha);

    if (result.success && mounted) {
      setState(() {
        _otpSent = true;
        _retryAfter = 0;
      });
    } else if (result.retryAfter != null) {
      setState(() => _retryAfter = result.retryAfter!);
    }
  }

  Future<void> _handleVerifyOtp() async {
    final email = _emailController.text.trim();
    final otp = _otpController.text.trim();
    if (email.isEmpty || otp.isEmpty) return;

    await context.read<AuthCubit>().verifyOtp(email, otp);
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const shad.Gap(64),
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
              shad.Tabs(
                index: _index,
                onChanged: (index) => setState(() => _index = index),
                children: [
                  shad.TabItem(child: Text(l10n.loginTabOtp)),
                  shad.TabItem(child: Text(l10n.loginTabPassword)),
                ],
              ),
              const shad.Gap(24),
              Expanded(
                child: IndexedStack(
                  index: _index,
                  children: [
                    _buildOtpTab(),
                    _buildPasswordTab(),
                  ],
                ),
              ),
              // Error display
              BlocBuilder<AuthCubit, AuthState>(
                buildWhen: (prev, curr) => prev.error != curr.error,
                builder: (context, state) {
                  if (state.error == null) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      state.error!,
                      style: TextStyle(
                        color: shad.Theme.of(context).colorScheme.destructive,
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
    );
  }

  Widget _buildOtpTab() {
    return BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) {
        return Column(
          children: [
            shad.FormField(
              key: const shad.FormKey<String>(#loginEmail),
              label: Text(context.l10n.emailLabel),
              child: shad.TextField(
                controller: _emailController,
                hintText: context.l10n.emailLabel,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _handleSendOtp(),
                enabled: !_otpSent && !state.isLoading,
              ),
            ),
            if (_otpSent) ...[
              const shad.Gap(16),
              shad.FormField(
                key: const shad.FormKey<String>(#loginOtp),
                label: const Text('OTP'),
                child: shad.InputOTP(
                  onChanged: (value) async {
                    _otpController.text = value.otpToString();
                    if (value.length == 6) {
                      await _handleVerifyOtp();
                    }
                  },
                  children: [
                    shad.InputOTPChild.character(allowDigit: true),
                    shad.InputOTPChild.character(allowDigit: true),
                    shad.InputOTPChild.character(allowDigit: true),
                    shad.InputOTPChild.separator,
                    shad.InputOTPChild.character(allowDigit: true),
                    shad.InputOTPChild.character(allowDigit: true),
                    shad.InputOTPChild.character(allowDigit: true),
                  ],
                ),
              ),
              const shad.Gap(16),
              shad.PrimaryButton(
                onPressed: state.isLoading ? null : _handleVerifyOtp,
                child: state.isLoading
                    ? const shad.CircularProgressIndicator(size: 20)
                    : Text(context.l10n.loginVerifyOtp),
              ),
            ] else ...[
              const shad.Gap(16),
              if (Env.isTurnstileConfigured) ...[
                CloudflareTurnstile(
                  siteKey: Env.turnstileSiteKey,
                  baseUrl: Env.turnstileBaseUrl,
                  onTokenReceived: (token) {
                    setState(() => _captchaToken = token);
                  },
                ),
                const shad.Gap(16),
              ],
              shad.PrimaryButton(
                onPressed:
                    state.isLoading ||
                        (Env.isTurnstileConfigured && _captchaToken == null)
                    ? null
                    : _handleSendOtp,
                child: state.isLoading
                    ? const shad.CircularProgressIndicator(size: 20)
                    : Text(
                        _retryAfter > 0
                            ? context.l10n.loginRetryAfter(_retryAfter)
                            : context.l10n.loginSendOtp,
                      ),
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _buildPasswordTab() {
    return BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) {
        return Column(
          children: [
            shad.FormField(
              key: const shad.FormKey<String>(#loginEmailPassword),
              label: Text(context.l10n.emailLabel),
              child: shad.TextField(
                controller: _emailController,
                hintText: context.l10n.emailLabel,
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
                hintText: context.l10n.passwordLabel,
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
            shad.PrimaryButton(
              onPressed:
                  state.isLoading ||
                      (Env.isTurnstileConfigured && _captchaToken == null)
                  ? null
                  : _handlePasswordLogin,
              child: state.isLoading
                  ? const shad.CircularProgressIndicator(size: 20)
                  : Text(context.l10n.loginSignIn),
            ),
          ],
        );
      },
    );
  }
}

import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/widgets/otp_input.dart';
import 'package:mobile/l10n/l10n.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _otpController = TextEditingController();

  bool _otpSent = false;
  int _retryAfter = 0;
  String? _captchaToken;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _handleSendOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;

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

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const Spacer(),
              Text(
                l10n.loginTitle,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.loginSubtitle,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 32),
              TabBar(
                controller: _tabController,
                tabs: [
                  Tab(text: l10n.loginTabOtp),
                  Tab(text: l10n.loginTabPassword),
                ],
              ),
              const SizedBox(height: 24),
              Expanded(
                flex: 3,
                child: TabBarView(
                  controller: _tabController,
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
                        color: Theme.of(context).colorScheme.error,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  );
                },
              ),
              TextButton(
                onPressed: () => context.push('/signup'),
                child: Text(l10n.loginSignUpPrompt),
              ),
              const SizedBox(height: 16),
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
            TextField(
              controller: _emailController,
              decoration: InputDecoration(
                labelText: context.l10n.emailLabel,
                border: const OutlineInputBorder(),
              ),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.done,
              enabled: !_otpSent && !state.isLoading,
            ),
            if (_otpSent) ...[
              const SizedBox(height: 16),
              OtpInput(
                controller: _otpController,
                onCompleted: (_) => _handleVerifyOtp(),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: state.isLoading ? null : _handleVerifyOtp,
                child: state.isLoading
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(context.l10n.loginVerifyOtp),
              ),
            ] else ...[
              if (Env.isTurnstileConfigured) ...[
                const SizedBox(height: 16),
                CloudflareTurnstile(
                  siteKey: Env.turnstileSiteKey,
                  baseUrl: Env.turnstileBaseUrl,
                  onTokenReceived: (token) {
                    setState(() => _captchaToken = token);
                  },
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed:
                    state.isLoading ||
                        (Env.isTurnstileConfigured && _captchaToken == null)
                    ? null
                    : _handleSendOtp,
                child: state.isLoading
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
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
            TextField(
              controller: _emailController,
              decoration: InputDecoration(
                labelText: context.l10n.emailLabel,
                border: const OutlineInputBorder(),
              ),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _passwordController,
              decoration: InputDecoration(
                labelText: context.l10n.passwordLabel,
                border: const OutlineInputBorder(),
              ),
              obscureText: true,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _handlePasswordLogin(),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => context.push('/forgot-password'),
                child: Text(context.l10n.loginForgotPassword),
              ),
            ),
            if (Env.isTurnstileConfigured) ...[
              const SizedBox(height: 8),
              CloudflareTurnstile(
                siteKey: Env.turnstileSiteKey,
                baseUrl: Env.turnstileBaseUrl,
                onTokenReceived: (token) {
                  setState(() => _captchaToken = token);
                },
              ),
            ],
            const SizedBox(height: 8),
            FilledButton(
              onPressed:
                  state.isLoading ||
                      (Env.isTurnstileConfigured && _captchaToken == null)
                  ? null
                  : _handlePasswordLogin,
              child: state.isLoading
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(context.l10n.loginSignIn),
            ),
          ],
        );
      },
    );
  }
}

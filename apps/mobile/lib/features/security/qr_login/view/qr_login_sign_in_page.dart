import 'dart:async';

import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/features/security/qr_login/data/qr_login_repository.dart';
import 'package:mobile/features/security/qr_login/qr_login_payload.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class QrLoginSignInPage extends StatefulWidget {
  const QrLoginSignInPage({super.key, QrLoginRepository? repository})
    : _repository = repository;

  final QrLoginRepository? _repository;

  @override
  State<QrLoginSignInPage> createState() => _QrLoginSignInPageState();
}

class _QrLoginSignInPageState extends State<QrLoginSignInPage> {
  static const _pollInterval = Duration(seconds: 2);

  late final QrLoginRepository _repository;
  Timer? _pollTimer;
  QrLoginChallenge? _challenge;
  String? _secret;
  String? _captchaToken;
  String? _error;
  bool _creating = false;
  bool _signingIn = false;
  int _turnstileAttempt = 0;

  @override
  void initState() {
    super.initState();
    _repository = widget._repository ?? QrLoginRepository();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || Env.isTurnstileConfigured) {
        return;
      }
      unawaited(_createChallenge());
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _createChallenge() async {
    if (_creating || _signingIn) {
      return;
    }

    setState(() {
      _creating = true;
      _error = null;
      _challenge = null;
      _secret = null;
    });
    _pollTimer?.cancel();

    final result = await _repository.createLoginChallenge(
      locale: context.l10n.localeName,
      origin: ApiConfig.baseUrl,
      captchaToken: _captchaToken,
    );

    if (!mounted) {
      return;
    }

    final challenge = result.challenge;
    final payload = QrLoginPayload.parse(challenge?.payload);
    if (!result.success || challenge == null || payload == null) {
      setState(() {
        _creating = false;
        _error = result.error ?? context.l10n.qrLoginApproveFailed;
      });
      return;
    }

    setState(() {
      _creating = false;
      _challenge = challenge;
      _secret = payload.secret;
    });
    _startPolling();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(_pollInterval, (_) {
      unawaited(_pollChallenge());
    });
    unawaited(_pollChallenge());
  }

  Future<void> _pollChallenge() async {
    final challenge = _challenge;
    final secret = _secret;
    if (challenge == null || secret == null || _signingIn) {
      return;
    }

    if (DateTime.now().toUtc().isAfter(challenge.expiresAt.toUtc())) {
      _pollTimer?.cancel();
      if (!mounted) {
        return;
      }
      setState(() => _error = context.l10n.qrLoginMobileExpired);
      return;
    }

    final result = await _repository.pollLoginChallenge(
      challengeId: challenge.id,
      secret: secret,
    );

    if (!mounted) {
      return;
    }

    if (result.status == QrLoginChallengeStatus.pending) {
      return;
    }

    if (result.status == QrLoginChallengeStatus.expired) {
      _pollTimer?.cancel();
      setState(() => _error = context.l10n.qrLoginMobileExpired);
      return;
    }

    final session = result.session;
    if (result.status == QrLoginChallengeStatus.approved && session != null) {
      _pollTimer?.cancel();
      setState(() {
        _signingIn = true;
        _error = null;
      });
      final ok = await context.read<AuthCubit>().signInWithQrLoginSession(
        session,
      );
      if (!mounted || ok) {
        return;
      }
      setState(() {
        _signingIn = false;
        _error = context.read<AuthCubit>().state.error;
      });
      return;
    }

    _pollTimer?.cancel();
    setState(() {
      _error = result.error ?? context.l10n.qrLoginApproveFailed;
    });
  }

  void _resetChallengeState() {
    _pollTimer?.cancel();
    setState(() {
      _captchaToken = null;
      _challenge = null;
      _secret = null;
      _error = null;
      _creating = false;
      _turnstileAttempt += 1;
    });
  }

  void _handleRetry() {
    if (Env.isTurnstileConfigured) {
      _resetChallengeState();
      return;
    }

    setState(() => _captchaToken = null);
    unawaited(_createChallenge());
  }

  Widget _buildTurnstile() {
    final theme = shad.Theme.of(context);

    if (!Env.isTurnstileConfigured || _challenge != null) {
      return const SizedBox.shrink();
    }

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 312),
        child: CloudflareTurnstile(
          key: ValueKey(_turnstileAttempt),
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
            unawaited(_createChallenge());
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final challenge = _challenge;
    final hasExpired =
        challenge != null &&
        DateTime.now().toUtc().isAfter(challenge.expiresAt.toUtc());
    final showRetry = !_creating && (_error != null || hasExpired);

    return AuthScaffold(
      title: l10n.qrLoginMobileTitle,
      showBackButton: true,
      backButtonLabel: l10n.navBack,
      onBack: () => context.pop(),
      child: AuthSectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.qrLoginMobileDescription,
              textAlign: TextAlign.center,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
                height: 1.35,
              ),
            ),
            const shad.Gap(20),
            if (challenge == null) ...[
              _buildTurnstile(),
              if (_creating) ...[
                const shad.Gap(16),
                const Center(child: AuthLoadingIndicator()),
                const shad.Gap(10),
                Text(
                  l10n.qrLoginMobileLoading,
                  textAlign: TextAlign.center,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ] else ...[
              Center(
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  padding: const EdgeInsets.all(14),
                  child: QrImageView(
                    data: challenge.payload,
                    size: 220,
                    backgroundColor: Colors.white,
                    dataModuleStyle: const QrDataModuleStyle(
                      color: Colors.black,
                    ),
                    eyeStyle: const QrEyeStyle(color: Colors.black),
                  ),
                ),
              ),
              const shad.Gap(16),
              Text(
                _signingIn
                    ? l10n.qrLoginMobileApproved
                    : l10n.qrLoginMobileWaiting,
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
            if (_error != null) ...[
              const shad.Gap(12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.destructive,
                ),
              ),
            ],
            if (showRetry) ...[
              const shad.Gap(16),
              AuthSecondaryButton(
                label: l10n.qrLoginMobileRetry,
                onPressed: _handleRetry,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

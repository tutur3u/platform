import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';
import 'package:mobile/features/security/qr_login/data/qr_login_repository.dart';
import 'package:mobile/features/security/qr_login/qr_login_payload.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:qr_flutter/qr_flutter.dart';

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
  String? _error;
  bool _creating = false;
  bool _signingIn = false;
  bool _polling = false;

  @override
  void initState() {
    super.initState();
    _repository = widget._repository ?? QrLoginRepository();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
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

    final captcha = await showSecurityCheck(context);
    if (!mounted) return;
    if (Env.isTurnstileConfigured && captcha == null) {
      setState(() => _creating = false);
      return;
    }
    final result = await _repository.createLoginChallenge(
      locale: context.l10n.localeName,
      origin: ApiConfig.baseUrl,
      captchaToken: captcha,
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
    if (challenge == null || secret == null || _signingIn || _polling) {
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

    _polling = true;
    try {
      final result = await _repository.pollLoginChallenge(
        challengeId: challenge.id,
        secret: secret,
      );

      if (!mounted || _challenge?.id != challenge.id) {
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
    } finally {
      _polling = false;
    }
  }

  void _handleRetry() => unawaited(_createChallenge());

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final challenge = _challenge;
    final hasExpired =
        challenge != null &&
        DateTime.now().toUtc().isAfter(challenge.expiresAt.toUtc());
    final showRetry =
        !_creating && (_challenge == null || _error != null || hasExpired);
    final waiting = challenge != null && !hasExpired && _error == null;

    return AuthScaffold(
      showBackButton: true,
      backButtonLabel: l10n.navBack,
      onBack: () => context.pop(),
      title: l10n.qrLoginMobileTitle,
      subtitle: Text(l10n.qrLoginMobileDescription),
      showLogo: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 248,
              height: 248,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                // The code stays black on white in every theme so any
                // camera reads it.
                color: challenge == null || hasExpired ? c.muted : Colors.white,
                borderRadius: BorderRadius.circular(AppRadius.sheet),
                border: Border.all(color: c.border),
              ),
              child: challenge == null || hasExpired
                  ? _creating
                        ? const AuthLoadingIndicator(
                            size: 40,
                            key: ValueKey('qr-login-loading'),
                          )
                        : Icon(
                            LucideIcons.qrCode,
                            size: 64,
                            color: c.mutedForeground,
                          )
                  : QrImageView(
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
          const AppGap(AppSpacing.lg),
          if (_creating)
            _QrStatus(text: l10n.qrLoginMobileLoading)
          else if (_signingIn)
            _QrStatus(text: l10n.qrLoginMobileApproved)
          else if (waiting)
            _QrStatus(text: l10n.qrLoginMobileWaiting),
          if (_error case final error?) ...[
            const AppGap(AppSpacing.sm),
            AuthInlineError(error),
          ],
          if (showRetry) ...[
            const AppGap(AppSpacing.lg),
            AuthSecondaryButton(
              label: l10n.qrLoginMobileRetry,
              leading: const Icon(LucideIcons.rotateCw, size: 18),
              onPressed: _handleRetry,
            ),
          ],
        ],
      ),
    );
  }
}

class _QrStatus extends StatelessWidget {
  const _QrStatus({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Semantics(
      liveRegion: true,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const AuthLoadingIndicator(size: 16),
          const SizedBox(width: AppSpacing.sm),
          Flexible(
            child: Text(
              text,
              textAlign: TextAlign.center,
              style: tokens.typography.bodySm.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

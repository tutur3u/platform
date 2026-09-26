import 'dart:async';

import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

final _activeChecks = Expando<bool>();

/// Tokens are returned once to the initiating action, never cached or reused.
Future<String?> showSecurityCheck(BuildContext context) async {
  if (!Env.isTurnstileConfigured) return null;
  final navigator = Navigator.of(context, rootNavigator: true);
  if (_activeChecks[navigator] ?? false) return null;
  _activeChecks[navigator] = true;
  try {
    // Try a background challenge first. A managed challenge still opens the
    // interactive dialog below; verification is never skipped.
    CloudflareTurnstile? invisible;
    try {
      invisible = CloudflareTurnstile.invisible(
        siteKey: Env.turnstileSiteKey,
        baseUrl: Env.turnstileBaseUrl,
      );
      final token = await invisible.getToken().timeout(
        const Duration(seconds: 6),
      );
      if (token != null && token.isNotEmpty) return token;
    } on Object {
      // Invisible verification is unavailable or requires user interaction.
    } finally {
      try {
        await invisible?.dispose();
      } on Object {
        // A failed background WebView must not hide the manual challenge.
      }
    }
    if (!context.mounted) return null;
    return await showDialog<String>(
      context: context,
      requestFocus: false,
      builder: (_) => const SecurityCheckDialog(),
    );
  } finally {
    _activeChecks[navigator] = false;
  }
}

typedef SecurityChallengeBuilder =
    Widget Function(
      Key key,
      ValueChanged<String> onToken,
      VoidCallback onFailure,
    );

class SecurityCheckDialog extends StatefulWidget {
  const SecurityCheckDialog({super.key, this.challengeBuilder});

  @visibleForTesting
  final SecurityChallengeBuilder? challengeBuilder;

  @override
  State<SecurityCheckDialog> createState() => _SecurityCheckDialogState();
}

class _SecurityCheckDialogState extends State<SecurityCheckDialog> {
  int _attempt = 0;
  bool _failed = false;
  bool _completed = false;

  void _fail() {
    if (mounted && !_completed) setState(() => _failed = true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Dialog(
      backgroundColor: theme.colorScheme.background,
      insetPadding: const EdgeInsets.all(20),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      context.l10n.securityCheckTitle,
                      style: theme.typography.large,
                    ),
                  ),
                  CloseButton(onPressed: () => Navigator.of(context).pop()),
                ],
              ),
              const SizedBox(height: 16),
              _challenge(theme),
              if (_failed) ...[
                const SizedBox(height: 12),
                Text(context.l10n.captchaError, textAlign: TextAlign.center),
                TextButton(
                  onPressed: () => setState(() {
                    _failed = false;
                    _attempt++;
                  }),
                  child: Text(context.l10n.commonRetry),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _challenge(shad.ThemeData theme) {
    final attempt = _attempt;
    void onToken(String token) {
      if (!mounted || _completed || attempt != _attempt || token.isEmpty) {
        return;
      }
      _completed = true;
      Navigator.of(context).pop(token);
    }

    void onFailure() {
      if (attempt == _attempt) _fail();
    }

    final key = ValueKey(attempt);
    return widget.challengeBuilder?.call(key, onToken, onFailure) ??
        CloudflareTurnstile(
          key: key,
          siteKey: Env.turnstileSiteKey,
          baseUrl: Env.turnstileBaseUrl,
          options: TurnstileOptions(
            size: TurnstileSize.flexible,
            theme: theme.brightness == Brightness.dark
                ? TurnstileTheme.dark
                : TurnstileTheme.light,
          ),
          onTokenReceived: onToken,
          onError: (_) => onFailure(),
          onTimeout: onFailure,
        );
  }
}

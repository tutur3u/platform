import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// "By continuing you agree to the Terms and Privacy Policy."
///
/// Agreeing to the terms is the only consent on the sign-in screen; product
/// email is a separate onboarding opt-in, off by default.
class AuthLegalFooter extends StatefulWidget {
  const AuthLegalFooter({this.onOpen, super.key});

  /// Opens a policy page; defaults to the device's link preference.
  @visibleForTesting
  final void Function(Uri uri)? onOpen;

  @override
  State<AuthLegalFooter> createState() => _AuthLegalFooterState();
}

class _AuthLegalFooterState extends State<AuthLegalFooter> {
  late final _terms = TapGestureRecognizer()..onTap = () => _open('/terms');
  late final _privacy = TapGestureRecognizer()..onTap = () => _open('/privacy');

  void _open(String path) {
    final base = Uri.tryParse(ApiConfig.baseUrl);
    if (base == null || base.host.isEmpty) return;
    final uri = Uri(
      scheme: base.scheme,
      host: base.host,
      port: base.hasPort ? base.port : null,
      path: path,
    );
    if (widget.onOpen case final open?) {
      open(uri);
      return;
    }
    unawaited(openMobileLink(context, uri));
  }

  @override
  void dispose() {
    _terms.dispose();
    _privacy.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    const termsMark = '\u0001';
    const privacyMark = '\u0002';
    final template = l10n.authLegalFooter(termsMark, privacyMark);
    final link = TextStyle(
      color: c.foreground,
      fontWeight: FontWeight.w600,
      decoration: TextDecoration.underline,
      decorationColor: c.foreground.withValues(alpha: 0.4),
    );
    final spans = <InlineSpan>[];
    var buffer = StringBuffer();
    for (final rune in template.runes) {
      final char = String.fromCharCode(rune);
      if (char != termsMark && char != privacyMark) {
        buffer.write(char);
        continue;
      }
      spans
        ..add(TextSpan(text: buffer.toString()))
        ..add(
          char == termsMark
              ? TextSpan(
                  text: l10n.authTermsLink,
                  style: link,
                  recognizer: _terms,
                )
              : TextSpan(
                  text: l10n.authPrivacyLink,
                  style: link,
                  recognizer: _privacy,
                ),
        );
      buffer = StringBuffer();
    }
    spans.add(TextSpan(text: buffer.toString()));
    return Text.rich(
      TextSpan(children: spans),
      key: const ValueKey('auth-legal-footer'),
      textAlign: TextAlign.center,
      style: tokens.typography.caption.copyWith(
        color: c.mutedForeground,
        fontWeight: FontWeight.w500,
        height: 1.5,
      ),
    );
  }
}

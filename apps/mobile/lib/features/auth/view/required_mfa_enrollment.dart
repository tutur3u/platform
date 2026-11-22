import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/required_mfa_policy.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/required_mfa_secret_card.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class RequiredMfaEnrollment extends StatefulWidget {
  const RequiredMfaEnrollment({
    required this.child,
    required this.user,
    super.key,
  });
  final Widget child;
  final User? user;
  @override
  State<RequiredMfaEnrollment> createState() => _RequiredMfaEnrollmentState();
}

class _RequiredMfaEnrollmentState extends State<RequiredMfaEnrollment> {
  final _code = TextEditingController();
  final _focus = FocusNode();
  String? _factorId;
  String? _secret;

  /// The `otpauth://` link from the same enrol response, for handing the
  /// secret to an authenticator app on this phone. No QR: it is the same
  /// screen.
  String? _uri;
  bool _busy = false;
  bool _openFailed = false;
  bool _failed = false;

  Future<void> _enroll() async {
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final factor = await supabase.auth.mfa.enroll();
      if (mounted) {
        setState(() {
          _factorId = factor.id;
          _secret = factor.totp?.secret;
          _uri = factor.totp?.uri;
        });
      }
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (_factorId == null || _code.text.length != 6) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final challenge = await supabase.auth.mfa.challenge(factorId: _factorId!);
      await supabase.auth.mfa.verify(
        factorId: _factorId!,
        challengeId: challenge.id,
        code: _code.text,
      );
      // AuthCubit handles the provider's mfaChallengeVerified event and routes.
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _openAuthenticator() async {
    final uri = Uri.tryParse(_uri ?? '');
    if (uri == null || uri.scheme != 'otpauth') return;
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Object {
      // The link carries the secret; never log it.
    }
    if (mounted) setState(() => _openFailed = !opened);
  }

  Future<void> _copySecret() async {
    final secret = _secret;
    if (secret == null) return;
    await Clipboard.setData(ClipboardData(text: secret));
    if (!mounted) return;
    showAppToast(context, message: context.l10n.requiredMfaSecretCopied);
  }

  @override
  Widget build(BuildContext context) {
    final policy = widget.user?.appMetadata['tuturuuu_required_mfa'];
    final required = policy is Map && policy['required'] == true;
    final hasFactor =
        widget.user?.factors?.any(
          (factor) => factor.status == FactorStatus.verified,
        ) ??
        false;
    final l10n = context.l10n;
    if (widget.user == null) return widget.child;
    if (requiresFreshPrimaryForMfa(supabase.auth.currentSession)) {
      return AuthScaffold(
        illustration: AppIllustrationKind.locked,
        title: l10n.requiredMfaRecoveryTitle,
        subtitle: Text(l10n.requiredMfaRecoveryDescription),
        bottomAction: AuthPrimaryButton(
          label: l10n.requiredMfaSignInAgain,
          onPressed: () => context.read<AuthCubit>().signOutCurrentAccount(),
        ),
        child: const SizedBox.shrink(),
      );
    }
    if (!required || hasFactor) return widget.child;
    final secret = _secret;
    return AuthScaffold(
      illustration: AppIllustrationKind.twoStep,
      title: l10n.requiredMfaEnrollTitle,
      subtitle: Text(l10n.requiredMfaEnrollDescription),
      footer: Center(
        child: AuthSecondaryButton(
          label: l10n.mfaSignOut,
          expand: false,
          variant: AuthSecondaryButtonVariant.ghost,
          onPressed: _busy
              ? null
              : () => context.read<AuthCubit>().signOutCurrentAccount(),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_failed) ...[
            AuthInlineError(l10n.requiredMfaError),
            const AppGap(AppSpacing.md),
          ],
          if (secret != null) ...[
            RequiredMfaSecretCard(
              secret: secret,
              canOpenAuthenticator: _uri != null,
              openFailed: _openFailed,
              onCopy: () => unawaited(_copySecret()),
              onOpenAuthenticator: () => unawaited(_openAuthenticator()),
            ),
            const AppGap(AppSpacing.lg),
            Text(
              l10n.requiredMfaCodeHint,
              textAlign: TextAlign.center,
              style: AppTokens.of(context).typography.bodySm.copyWith(
                color: AppTokens.of(context).colorScheme.mutedForeground,
              ),
            ),
            const AppGap(AppSpacing.md),
            Center(
              child: AuthOtpField(
                controller: _code,
                focusNode: _focus,
                enabled: !_busy,
                semanticLabel: l10n.mfaCodeLabel,
                onChanged: (_) {},
                onCompleted: (_) => _verify(),
              ),
            ),
            const AppGap(AppSpacing.lg),
            AuthPrimaryButton(
              label: l10n.requiredMfaVerify,
              isLoading: _busy,
              onPressed: _verify,
            ),
          ] else
            AuthPrimaryButton(
              label: l10n.requiredMfaStart,
              isLoading: _busy,
              onPressed: _enroll,
            ),
        ],
      ),
    );
  }
}

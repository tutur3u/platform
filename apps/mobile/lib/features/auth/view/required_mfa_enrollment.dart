import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/required_mfa_policy.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
  bool _busy = false;
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
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l10n.requiredMfaRecoveryTitle,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 16),
              Text(l10n.requiredMfaRecoveryDescription),
              const SizedBox(height: 24),
              AuthPrimaryButton(
                label: l10n.requiredMfaSignInAgain,
                onPressed: () =>
                    context.read<AuthCubit>().signOutCurrentAccount(),
              ),
            ],
          ),
        ),
      );
    }
    if (!required || hasFactor) return widget.child;
    return Center(
      child: SingleChildScrollView(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.requiredMfaEnrollTitle,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 16),
              Text(l10n.requiredMfaEnrollDescription),
              if (_failed)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(l10n.requiredMfaError),
                ),
              const SizedBox(height: 20),
              if (_secret != null) ...[
                Text(l10n.requiredMfaSecretLabel),
                const SizedBox(height: 12),
                SelectableText(_secret!),
                const SizedBox(height: 20),
                AuthOtpField(
                  controller: _code,
                  focusNode: _focus,
                  enabled: !_busy,
                  onChanged: (_) {},
                  onCompleted: (_) => _verify(),
                ),
                const SizedBox(height: 20),
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
              const SizedBox(height: 12),
              AuthSecondaryButton(
                label: l10n.mfaSignOut,
                onPressed: _busy
                    ? null
                    : () => context.read<AuthCubit>().signOutCurrentAccount(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

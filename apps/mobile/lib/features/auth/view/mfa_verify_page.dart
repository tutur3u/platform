import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, AppBar, FilledButton, Scaffold, TextButton;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class MfaVerifyPage extends StatefulWidget {
  const MfaVerifyPage({super.key});

  @override
  State<MfaVerifyPage> createState() => _MfaVerifyPageState();
}

class _MfaVerifyPageState extends State<MfaVerifyPage> {
  final _codeController = TextEditingController();
  final _otpFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _otpFocusNode.requestFocus();
      }
    });
  }

  @override
  void dispose() {
    _codeController.dispose();
    _otpFocusNode.dispose();
    super.dispose();
  }

  Future<void> _handleVerify() async {
    final code = _codeController.text.trim();
    if (code.length != 6) return;

    await context.read<AuthCubit>().verifyMfa(code);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AuthScaffold(
      child: BlocBuilder<AuthCubit, AuthState>(
        buildWhen: (prev, curr) =>
            prev.isLoading != curr.isLoading || prev.error != curr.error,
        builder: (context, state) {
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 290),
                    child: Center(
                      child: Text(
                        l10n.mfaTitle,
                        style: theme.typography.h2.copyWith(
                          height: 1.02,
                          letterSpacing: -0.6,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                  const shad.Gap(18),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 260),
                    child: Text(
                      l10n.mfaSubtitle,
                      style: theme.typography.textMuted.copyWith(
                        fontSize: 15,
                        height: 1.35,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const shad.Gap(30),
                  Text(
                    l10n.mfaCodeLabel,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.mutedForeground,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.3,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const shad.Gap(16),
                  Center(
                    child: AuthOtpField(
                      controller: _codeController,
                      focusNode: _otpFocusNode,
                      enabled: !state.isLoading,
                      onChanged: (_) {},
                      onCompleted: (_) => unawaited(_handleVerify()),
                    ),
                  ),
                  if (state.error != null) ...[
                    const shad.Gap(18),
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 280),
                        child: Text(
                          state.error!,
                          style: theme.typography.small.copyWith(
                            color: theme.colorScheme.destructive,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ],
                  const shad.Gap(32),
                  AuthPrimaryButton(
                    label: l10n.mfaVerify,
                    isLoading: state.isLoading,
                    onPressed: _handleVerify,
                  ),
                  const shad.Gap(12),
                  Center(
                    child: _SignOutButton(l10n: l10n, isBusy: state.isLoading),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SignOutButton extends StatelessWidget {
  const _SignOutButton({
    required this.l10n,
    required this.isBusy,
  });

  final AppLocalizations l10n;
  final bool isBusy;

  @override
  Widget build(BuildContext context) {
    return AuthSecondaryButton(
      label: l10n.mfaSignOut,
      expand: false,
      onPressed: isBusy
          ? null
          : () {
              unawaited(context.read<AuthCubit>().signOut());
            },
      variant: AuthSecondaryButtonVariant.ghost,
    );
  }
}

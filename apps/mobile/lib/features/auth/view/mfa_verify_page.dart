import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/required_mfa_enrollment.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/l10n/l10n.dart';

class MfaVerifyPage extends StatefulWidget {
  const MfaVerifyPage({super.key});

  @override
  State<MfaVerifyPage> createState() => _MfaVerifyPageState();
}

class _MfaVerifyPageState extends State<MfaVerifyPage> {
  final _codeController = TextEditingController();
  final _otpFocusNode = FocusNode();
  bool _deviceBusy = false;
  bool _hasDevice = false;
  bool _deviceFailed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadDevice());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _otpFocusNode.requestFocus();
      }
    });
  }

  Future<void> _loadDevice() async {
    try {
      final registered = await DeviceMfaService().isRegistered();
      if (mounted) setState(() => _hasDevice = registered);
    } on Object {
      // Other authenticators remain available if local storage fails.
    }
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

  Future<void> _verifyDevice() async {
    if (_deviceBusy) return;
    final reason = context.l10n.deviceMfaVerifyReason;
    setState(() {
      _deviceBusy = true;
      _deviceFailed = false;
    });
    try {
      await DeviceMfaService().verify(reason: reason);
    } on Object {
      if (mounted) setState(() => _deviceFailed = true);
    } finally {
      if (mounted) setState(() => _deviceBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (prev, curr) =>
          prev.isLoading != curr.isLoading || prev.error != curr.error,
      builder: (context, state) {
        final busy = state.isLoading;
        return RequiredMfaEnrollment(
          user: state.user,
          key: ValueKey(state.user?.id),
          child: AuthScaffold(
            illustration: AppIllustrationKind.twoStep,
            title: l10n.mfaTwoStepTitle,
            subtitle: Text(l10n.mfaSubtitle),
            footer: Center(
              child: AuthSecondaryButton(
                label: l10n.mfaSignOut,
                expand: false,
                variant: AuthSecondaryButtonVariant.ghost,
                onPressed: busy
                    ? null
                    : () => unawaited(
                        context.read<AuthCubit>().signOutAllAccounts(),
                      ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: AuthOtpField(
                    controller: _codeController,
                    focusNode: _otpFocusNode,
                    autofocus: true,
                    enabled: !busy,
                    semanticLabel: l10n.mfaCodeLabel,
                    onChanged: (_) {},
                    onCompleted: (_) => unawaited(_handleVerify()),
                  ),
                ),
                if (state.error case final error?) ...[
                  const AppGap(AppSpacing.md),
                  AuthInlineError(error),
                ],
                const AppGap(AppSpacing.lg),
                AuthPrimaryButton(
                  label: l10n.mfaVerify,
                  isLoading: busy,
                  onPressed: _handleVerify,
                ),
                if (_hasDevice) ...[
                  const AppGap(AppSpacing.md),
                  AuthSecondaryButton(
                    label: l10n.deviceMfaUseDevice,
                    leading: const Icon(LucideIcons.scanFace, size: 18),
                    isLoading: _deviceBusy,
                    onPressed: busy || _deviceBusy ? null : _verifyDevice,
                  ),
                ],
                if (_deviceFailed) ...[
                  const AppGap(AppSpacing.sm),
                  AuthInlineError(l10n.deviceMfaError),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

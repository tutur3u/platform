import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

Future<bool?> showMfaApprovalDialog(
  BuildContext context,
  PendingMfaApproval approval,
  MfaApprovalRepository repository,
) {
  final auth = context.read<AuthCubit>();
  return shad.showDialog<bool>(
    context: context,
    builder: (_) => MfaApprovalDialog(
      approval: approval,
      repository: repository,
      currentUserId: () => auth.state.user?.id,
    ),
  );
}

class MfaApprovalDialog extends StatefulWidget {
  const MfaApprovalDialog({
    required this.approval,
    required this.repository,
    required this.currentUserId,
    this.deviceMfa,
    super.key,
  });
  final PendingMfaApproval approval;
  final MfaApprovalRepository repository;
  final DeviceMfaService? deviceMfa;
  final String? Function() currentUserId;

  @override
  State<MfaApprovalDialog> createState() => _MfaApprovalDialogState();
}

class _MfaApprovalDialogState extends State<MfaApprovalDialog> {
  final _code = TextEditingController();
  final _focus = FocusNode();
  late final DeviceMfaService _deviceMfa =
      widget.deviceMfa ?? DeviceMfaService();
  late final String? _userId = widget.currentUserId();
  Timer? _timer;
  bool _busy = false;
  bool _failed = false;
  bool get _expired => !widget.approval.expiresAt.isAfter(DateTime.now());

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _submit({bool reject = false}) async {
    if (_busy || _expired || (!reject && _code.text.length != 6)) return;
    final reason = context.l10n.deviceMfaVerifyReason;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final proof = reject
          ? <String, String>{}
          : await _deviceMfa.approvalProof(reason: reason);
      if (!mounted || _expired || widget.currentUserId() != _userId) return;
      final result = await widget.repository.approve(
        widget.approval,
        pairCode: _code.text,
        reject: reject,
        deviceProof: proof,
      );
      if (!mounted) return;
      if (result.success) {
        Navigator.of(context).pop(!reject);
      } else {
        setState(() => _failed = true);
      }
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final seconds = widget.approval.expiresAt
        .difference(DateTime.now())
        .inSeconds
        .clamp(0, 300);
    return AppDialogScaffold(
      title: l10n.deviceMfaNumberTitle,
      description: l10n.deviceMfaNumberHint,
      icon: Icons.verified_user_outlined,
      maxWidth: 420,
      actions: [
        shad.OutlineButton(
          onPressed: _busy || _expired
              ? null
              : () => unawaited(_submit(reject: true)),
          child: Text(l10n.deviceMfaDeny),
        ),
        shad.PrimaryButton(
          onPressed: _busy || _expired || _code.text.length != 6
              ? null
              : () => unawaited(_submit()),
          child: _busy
              ? const shad.CircularProgressIndicator(size: 16)
              : Text(l10n.mfaApprovalApproveAction),
        ),
      ],
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.approval.browser case final browser?) ...[
              Text(browser, maxLines: 2, overflow: TextOverflow.ellipsis),
              const shad.Gap(12),
            ],
            AuthOtpField(
              controller: _code,
              focusNode: _focus,
              enabled: !_busy && !_expired,
              onChanged: (_) => setState(() {}),
            ),
            const shad.Gap(12),
            Text(
              _expired
                  ? l10n.deviceMfaExpired
                  : '${seconds ~/ 60}:'
                        '${(seconds % 60).toString().padLeft(2, '0')}',
            ),
            if (_failed) ...[const shad.Gap(12), Text(l10n.deviceMfaError)],
          ],
        ),
      ),
    );
  }
}

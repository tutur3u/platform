import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/iris/data/iris_device_identity.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/l10n/l10n.dart';

/// Enrols this device: the relay returns a 6-digit code, the app shows it
/// with the key fingerprint's prefix, and the owner confirms on the Iris enrol
/// page with their passkey. The app then polls the device until it is
/// confirmed or expired (15 minutes). No chat message or typed command
/// confirms a device.
class IrisEnrolPanel extends StatefulWidget {
  const IrisEnrolPanel({
    required this.relay,
    required this.identity,
    this.onFinished,
    this.pollEvery = const Duration(seconds: 3),
    super.key,
  });

  final IrisRelay relay;
  final IrisDeviceIdentity? identity;
  final VoidCallback? onFinished;
  final Duration pollEvery;

  @override
  State<IrisEnrolPanel> createState() => _IrisEnrolPanelState();
}

class _IrisEnrolPanelState extends State<IrisEnrolPanel> {
  IrisEnrollment? _enrolment;
  IrisDeviceStatus? _status;
  IrisFailure? _failure;
  bool _starting = false;
  Timer? _poll;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    final identity = widget.identity;
    if (identity == null || _starting) return;
    setState(() {
      _starting = true;
      _failure = null;
    });
    final key = await identity.load();
    final result = key == null
        ? const IrisErr<IrisEnrollment>(
            IrisFailure(IrisFailureKind.notConfigured),
          )
        : await widget.relay.enroll(key.publicKey, key.fingerprint);
    if (!mounted) return;
    setState(() {
      _starting = false;
      _enrolment = result.valueOrNull;
      _failure = result.failureOrNull;
      _status = _enrolment == null ? null : IrisDeviceStatus.pending;
    });
    if (_enrolment != null) _schedule();
    widget.onFinished?.call();
  }

  void _schedule() {
    _poll?.cancel();
    _poll = Timer(widget.pollEvery, () => unawaited(_check()));
  }

  Future<void> _check() async {
    final enrolment = _enrolment;
    if (enrolment == null) return;
    final result = await widget.relay.device(enrolment.deviceId);
    if (!mounted) return;
    var status = result.valueOrNull?.status ?? _status;
    if (status == IrisDeviceStatus.pending &&
        !DateTime.now().toUtc().isBefore(enrolment.expiresAt)) {
      status = IrisDeviceStatus.expired;
    }
    setState(() => _status = status);
    if (status == IrisDeviceStatus.pending) {
      _schedule();
    } else {
      widget.onFinished?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final enrolment = _enrolment;
    final waiting = _status == IrisDeviceStatus.pending;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (enrolment != null && _status != null) ...[
            Text(l10n.mastermindIrisEnrolCode, style: tokens.typography.small),
            const SizedBox(height: AppSpacing.xs),
            SelectableText(
              enrolment.code,
              key: const ValueKey('iris-enrol-code'),
              style: tokens.typography.xLarge.copyWith(
                fontWeight: FontWeight.w600,
                letterSpacing: 6,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              l10n.mastermindIrisEnrolInstructions(enrolment.fingerprintPrefix),
            ),
            const SizedBox(height: AppSpacing.sm),
            Semantics(
              liveRegion: true,
              child: Text(
                switch (_status!) {
                  IrisDeviceStatus.pending => l10n.mastermindIrisEnrolWaiting,
                  IrisDeviceStatus.confirmed =>
                    l10n.mastermindIrisEnrolConfirmed,
                  IrisDeviceStatus.expired ||
                  IrisDeviceStatus.revoked => l10n.mastermindIrisEnrolExpired,
                },
                key: const ValueKey('iris-enrol-status'),
                style: tokens.typography.small.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (_failure case final failure?) ...[
            AppAlert.destructive(
              content: Text(
                failure.kind == IrisFailureKind.rateLimited
                    ? l10n.mastermindIrisEnrolLimit
                    : l10n.mastermindIrisEnrolFailed,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (widget.identity == null)
            AppAlert(
              leading: const Icon(AppIcons.info),
              content: Text(l10n.mastermindIrisEnrolUnavailable),
            )
          else if (!waiting && _status != IrisDeviceStatus.confirmed)
            AppButton.primary(
              key: const ValueKey('iris-enrol-start'),
              onPressed: _starting ? null : () => unawaited(_start()),
              child: Text(l10n.mastermindIrisEnrol),
            ),
        ],
      ),
    );
  }
}

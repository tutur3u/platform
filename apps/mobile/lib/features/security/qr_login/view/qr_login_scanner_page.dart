import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/qr_login/data/qr_login_repository.dart';
import 'package:mobile/features/security/qr_login/qr_login_payload.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class QrLoginScannerPage extends StatefulWidget {
  const QrLoginScannerPage({super.key, QrLoginRepository? repository})
    : _repository = repository;

  final QrLoginRepository? _repository;

  @override
  State<QrLoginScannerPage> createState() => _QrLoginScannerPageState();
}

class _QrLoginScannerPageState extends State<QrLoginScannerPage> {
  late final MobileScannerController _controller;
  late final QrLoginRepository _repository;
  QrLoginPayload? _payload;
  String? _error;
  bool _approving = false;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      formats: const [BarcodeFormat.qrCode],
    );
    _repository = widget._repository ?? QrLoginRepository();
  }

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  void _handleDetect(BarcodeCapture capture) {
    if (_payload != null || _approving) {
      return;
    }

    for (final barcode in capture.barcodes) {
      final parsed = QrLoginPayload.parse(barcode.rawValue);
      if (parsed == null) {
        continue;
      }

      setState(() {
        _payload = parsed;
        _error = null;
      });
      unawaited(_controller.stop());
      return;
    }

    if (_error == null) {
      setState(() => _error = context.l10n.qrLoginInvalidCode);
    }
  }

  Future<void> _approve() async {
    final payload = _payload;
    if (payload == null || _approving) {
      return;
    }

    final l10n = context.l10n;
    final appLockCubit = context.read<AppLockCubit>();
    if (!appLockCubit.state.enabled) {
      setState(() => _error = l10n.qrLoginRequiresAppLock);
      return;
    }

    setState(() {
      _approving = true;
      _error = null;
    });

    final authenticated = await appLockCubit.authenticateForQrLogin(
      reason: l10n.qrLoginLocalAuthReason,
    );

    if (!mounted) {
      return;
    }

    if (!authenticated) {
      setState(() {
        _approving = false;
        _error = l10n.qrLoginLocalAuthFailed;
      });
      return;
    }

    final result = await _repository.approve(payload);
    if (!mounted) {
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (result.success) {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, _) => shad.Alert(
            title: Text(context.l10n.qrLoginApprovedTitle),
            content: Text(context.l10n.qrLoginApprovedDescription),
          ),
        );
      }
      context.pop();
      return;
    }

    setState(() {
      _approving = false;
      _error = result.error ?? l10n.qrLoginApproveFailed;
    });
  }

  void _scanAgain() {
    setState(() {
      _payload = null;
      _error = null;
    });
    unawaited(_controller.start());
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final user = context.watch<AuthCubit>().state.user;

    return shad.Scaffold(
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  shad.OutlineButton(
                    onPressed: () => context.pop(),
                    child: const Icon(Icons.arrow_back_rounded),
                  ),
                  const shad.Gap(12),
                  Expanded(
                    child: Text(
                      l10n.qrLoginScannerTitle,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(
                        controller: _controller,
                        onDetect: _handleDetect,
                        errorBuilder: (context, error) => ColoredBox(
                          color: Colors.black,
                          child: Center(
                            child: Text(
                              l10n.qrLoginCameraUnavailable,
                              style: theme.typography.small.copyWith(
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                      IgnorePointer(
                        child: Center(
                          child: Container(
                            width: 240,
                            height: 240,
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.9),
                                width: 3,
                              ),
                              borderRadius: BorderRadius.circular(28),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: _payload == null
                  ? _ScannerHint(error: _error)
                  : _ApprovalPanel(
                      approving: _approving,
                      error: _error,
                      origin: _payload!.origin.origin,
                      userEmail: user?.email ?? l10n.settingsNoEmail,
                      onApprove: _approve,
                      onScanAgain: _scanAgain,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScannerHint extends StatelessWidget {
  const _ScannerHint({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          l10n.qrLoginScannerDescription,
          textAlign: TextAlign.center,
          style: theme.typography.textSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        if (error != null) ...[
          const shad.Gap(8),
          Text(
            error!,
            textAlign: TextAlign.center,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.destructive,
            ),
          ),
        ],
      ],
    );
  }
}

class _ApprovalPanel extends StatelessWidget {
  const _ApprovalPanel({
    required this.approving,
    required this.error,
    required this.origin,
    required this.userEmail,
    required this.onApprove,
    required this.onScanAgain,
  });

  final bool approving;
  final String? error;
  final String origin;
  final String userEmail;
  final Future<void> Function() onApprove;
  final VoidCallback onScanAgain;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.qrLoginApproveTitle,
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(10),
          Text(
            l10n.qrLoginApproveDescription(origin, userEmail),
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          if (error != null) ...[
            const shad.Gap(10),
            Text(
              error!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.destructive,
              ),
            ),
          ],
          const shad.Gap(16),
          Row(
            children: [
              Expanded(
                child: shad.OutlineButton(
                  enabled: !approving,
                  onPressed: onScanAgain,
                  child: Text(l10n.qrLoginScanAgain),
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: shad.PrimaryButton(
                  enabled: !approving,
                  onPressed: () => unawaited(onApprove()),
                  child: approving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(l10n.qrLoginApproveAction),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

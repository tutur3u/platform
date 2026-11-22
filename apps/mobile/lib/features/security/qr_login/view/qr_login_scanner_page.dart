import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
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
    setState(() {
      _approving = true;
      _error = null;
    });

    final userId = context.read<AuthCubit>().state.user?.id;
    late final Map<String, String> proof;
    try {
      proof = await DeviceMfaService().approvalProof(
        reason: l10n.qrLoginLocalAuthReason,
      );
    } on Object {
      if (mounted) {
        setState(() {
          _approving = false;
          _error = l10n.qrLoginLocalAuthFailed;
        });
      }
      return;
    }
    if (!mounted || context.read<AuthCubit>().state.user?.id != userId) return;

    final result = await _repository.approve(payload, deviceProof: proof);
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

  Future<void> _enterLink() async {
    final controller = TextEditingController();
    final value = await showAppDialog<String>(
      context: context,
      builder: (context) => AppDialog(
        title: context.l10n.deviceMfaQrPaste,
        content: shad.TextField(
          selectionControls: platformTextSelectionControls(),
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
          placeholder: Text(context.l10n.deviceMfaQrPasteHint),
        ),
        actions: [
          shad.OutlineButton(
            alignment: Alignment.center,
            onPressed: () => Navigator.of(context).pop(),
            child: Text(context.l10n.commonCancel),
          ),
          shad.PrimaryButton(
            alignment: Alignment.center,
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: Text(context.l10n.deviceMfaReview),
          ),
        ],
      ),
    );
    controller.dispose();
    if (!mounted || value == null) return;
    final parsed = QrLoginPayload.parse(value);
    setState(() {
      _payload = parsed;
      _error = parsed == null ? context.l10n.qrLoginInvalidCode : null;
    });
    if (parsed != null) await _controller.stop();
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
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    final user = context.watch<AuthCubit>().state.user;
    final radius = tokens.interface.borderRadius(AppRadius.card);

    return shad.Scaffold(
      // The camera viewport is an inset rounded card, so it shares the page
      // gutters and detail width with the instructions below it.
      child: AppPageBody(
        child: Column(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                child: ClipRRect(
                  borderRadius: radius,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(
                        controller: _controller,
                        onDetect: _handleDetect,
                        errorBuilder: (context, error) => ColoredBox(
                          color: Colors.black,
                          // Scrolls in a short window or at large text so
                          // the explanation never overflows the viewport.
                          child: Center(
                            child: SingleChildScrollView(
                              padding: const EdgeInsets.all(AppSpacing.xl),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    LucideIcons.cameraOff,
                                    color: Colors.white70,
                                    size: 32,
                                  ),
                                  const SizedBox(height: AppSpacing.md),
                                  Text(
                                    l10n.qrLoginCameraUnavailable,
                                    textAlign: TextAlign.center,
                                    style: tokens.typography.small.copyWith(
                                      color: Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      const IgnorePointer(child: Center(child: _ScanFrame())),
                    ],
                  ),
                ),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                child: _payload == null
                    ? _ScannerHint(error: _error, onEnterLink: _enterLink)
                    : _ApprovalPanel(
                        approving: _approving,
                        error: _error,
                        origin: _payload!.origin.origin,
                        userEmail: user?.email ?? l10n.settingsNoEmail,
                        onApprove: _approve,
                        onScanAgain: _scanAgain,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Four rounded corner brackets that frame the code without hiding it.
class _ScanFrame extends StatelessWidget {
  const _ScanFrame();

  @override
  Widget build(BuildContext context) {
    const size = 232.0;
    const arm = 44.0;
    const stroke = 4.0;
    final color = Colors.white.withValues(alpha: 0.92);
    Widget corner(Alignment alignment, BorderRadius radius, Border border) =>
        Align(
          alignment: alignment,
          child: Container(
            width: arm,
            height: arm,
            decoration: BoxDecoration(borderRadius: radius, border: border),
          ),
        );
    final side = BorderSide(color: color, width: stroke);
    const r = Radius.circular(22);
    return SizedBox.square(
      dimension: size,
      child: Stack(
        children: [
          corner(
            Alignment.topLeft,
            const BorderRadius.only(topLeft: r),
            Border(top: side, left: side),
          ),
          corner(
            Alignment.topRight,
            const BorderRadius.only(topRight: r),
            Border(top: side, right: side),
          ),
          corner(
            Alignment.bottomLeft,
            const BorderRadius.only(bottomLeft: r),
            Border(bottom: side, left: side),
          ),
          corner(
            Alignment.bottomRight,
            const BorderRadius.only(bottomRight: r),
            Border(bottom: side, right: side),
          ),
        ],
      ),
    );
  }
}

class _ScannerHint extends StatelessWidget {
  const _ScannerHint({required this.onEnterLink, this.error});

  final String? error;
  final Future<void> Function() onEnterLink;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;

    return AppGroupedCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      showDividers: false,
      children: [
        Row(
          children: [
            const AppIconTile(icon: LucideIcons.scanQrCode),
            const SizedBox(width: AppLayout.rowLeadingGap),
            Expanded(
              child: Text(
                l10n.qrLoginScannerDescription,
                style: tokens.typography.small.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
          ],
        ),
        if (error != null) ...[
          const SizedBox(height: AppSpacing.md),
          AppAlert.destructive(content: Text(error!)),
        ],
        const SizedBox(height: AppSpacing.md),
        AppButton.outline(
          leading: const Icon(LucideIcons.link, size: 16),
          onPressed: () => unawaited(onEnterLink()),
          child: Text(l10n.deviceMfaQrPaste),
        ),
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
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;

    return AppGroupedCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      showDividers: false,
      children: [
        Semantics(
          header: true,
          child: Row(
            children: [
              const AppIconTile(
                icon: LucideIcons.shieldCheck,
                tone: AppTone.primary,
              ),
              const SizedBox(width: AppLayout.rowLeadingGap),
              Expanded(
                child: Text(
                  l10n.qrLoginApproveTitle,
                  style: tokens.typography.large.copyWith(
                    fontWeight: FontWeight.w700,
                    color: tokens.colorScheme.foreground,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Semantics(
          label: l10n.qrLoginApproveDescription(origin, userEmail),
          excludeSemantics: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppKeyValueRow(label: l10n.qrLoginApproveSite, value: origin),
              AppKeyValueRow(
                label: l10n.qrLoginApproveAccount,
                value: userEmail,
              ),
            ],
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: AppSpacing.sm),
          AppAlert.destructive(content: Text(error!)),
        ],
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            Expanded(
              child: AppButton.outline(
                enabled: !approving,
                onPressed: onScanAgain,
                child: Text(l10n.qrLoginScanAgain),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AppButton.primary(
                enabled: !approving,
                loading: approving,
                onPressed: () => unawaited(onApprove()),
                child: Text(l10n.qrLoginApproveAction),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

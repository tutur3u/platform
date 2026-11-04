import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// The camera scanner exists only on the phone and tablet builds.
bool get inventoryScanSupported =>
    !kIsWeb && (Platform.isIOS || Platform.isAndroid);

/// Opens the camera and returns the first detected code, or null when the
/// sheet closes. Returns [inventoryScanSearchInsteadCode] when the camera is
/// unavailable and the user chooses to search.
Future<String?> showInventoryScanSheet(BuildContext context) =>
    showAppSheet<String>(
      context: context,
      builder: (_) => const _InventoryScanSheet(),
    );

/// Sentinel result: the user gave up on the camera and wants to type.
const inventoryScanSearchInsteadCode = '\u0000search';

class _InventoryScanSheet extends StatefulWidget {
  const _InventoryScanSheet();

  @override
  State<_InventoryScanSheet> createState() => _InventoryScanSheetState();
}

class _InventoryScanSheetState extends State<_InventoryScanSheet> {
  final MobileScannerController _scanner = MobileScannerController();
  bool _detected = false;

  @override
  void dispose() {
    unawaited(_scanner.dispose());
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_detected) return;
    for (final code in capture.barcodes) {
      final value = code.rawValue?.trim();
      if (value == null || value.isEmpty) continue;
      _detected = true;
      unawaited(_scanner.stop());
      Navigator.of(context).pop(value);
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return AppSheetScaffold(
      title: l10n.inventoryScanTitle,
      description: l10n.inventoryScanHint,
      icon: LucideIcons.scanLine,
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.lg),
        child: AspectRatio(
          aspectRatio: 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(
              tokens.interface.radius(AppRadius.card),
            ),
            child: ColoredBox(
              color: tokens.colorScheme.muted,
              child: MobileScanner(
                controller: _scanner,
                onDetect: _onDetect,
                errorBuilder: (context, _) => Center(
                  child: AppStateMessage(
                    icon: LucideIcons.cameraOff,
                    title: l10n.inventoryScanUnavailable,
                    actionLabel: l10n.inventoryScanSearchInstead,
                    onAction: () => Navigator.of(
                      context,
                    ).pop(inventoryScanSearchInsteadCode),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

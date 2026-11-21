import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// The link code in mono type with Copy. Copying confirms with a toast and
/// never logs the code.
class FleetLinkCodeBlock extends StatelessWidget {
  const FleetLinkCodeBlock({required this.code, super.key});

  final String code;

  Future<void> _copy(BuildContext context) async {
    final l10n = context.l10n;
    await Clipboard.setData(ClipboardData(text: code));
    if (context.mounted) {
      showAppToast(
        context,
        message: l10n.mastermindFleetAccessLinkCopied,
        variant: AppAlertVariant.success,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: tokens.colorScheme.muted,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.sm,
        children: [
          Semantics(
            label: l10n.mastermindFleetAccessLinkCodeLabel(
              code.split('').join(' '),
            ),
            excludeSemantics: true,
            child: SelectableText(
              code,
              style: tokens.typography.numeric.copyWith(
                fontSize: 16,
                height: 1.4,
                fontWeight: FontWeight.w600,
                color: tokens.colorScheme.foreground,
              ),
            ),
          ),
          AppButton.outline(
            key: const ValueKey('fleet-access-link-copy'),
            leading: const Icon(LucideIcons.copy, size: 16),
            onPressed: () => unawaited(_copy(context)),
            child: Text(l10n.mastermindFleetAccessLinkCopy),
          ),
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// A device code in large mono type with Copy. Copying confirms with a toast
/// and never logs the code.
class FleetLoginCode extends StatelessWidget {
  const FleetLoginCode({required this.code, super.key});

  final String code;

  Future<void> _copy(BuildContext context) async {
    final l10n = context.l10n;
    await Clipboard.setData(ClipboardData(text: code));
    if (context.mounted) {
      showAppToast(
        context,
        message: l10n.mastermindFleetCodeCopied,
        variant: AppAlertVariant.success,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: tokens.colorScheme.muted,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      // The code takes the first line; Copy moves below it when both do not
      // fit, such as a long code at a large text size.
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          Semantics(
            label: l10n.mastermindFleetDeviceCode(code.split('').join(' ')),
            excludeSemantics: true,
            child: SelectableText(
              code,
              style: tokens.typography.numeric.copyWith(
                fontSize: 28,
                height: 1.2,
                fontWeight: FontWeight.w600,
                letterSpacing: 2,
                color: tokens.colorScheme.foreground,
              ),
            ),
          ),
          AppButton.outline(
            leading: const Icon(LucideIcons.copy, size: 16),
            onPressed: () => unawaited(_copy(context)),
            child: Text(l10n.mastermindFleetCopyCode),
          ),
        ],
      ),
    );
  }
}

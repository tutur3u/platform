import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Muted label with its value on the trailing edge, for detail screens and
/// summaries inside an `AppPanel`. Long values wrap; the label keeps at
/// least a third of the width.
class AppKeyValueRow extends StatelessWidget {
  const AppKeyValueRow({
    required this.label,
    required this.value,
    this.trailing,
    this.padding = const EdgeInsets.symmetric(vertical: AppSpacing.sm),
    super.key,
  });

  final String label;
  final String value;

  /// A small control or badge after the value, such as a copy button.
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Semantics(
      container: true,
      child: Padding(
        padding: padding,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                label,
                style: tokens.typography.small.copyWith(
                  color: c.mutedForeground,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              flex: 2,
              child: Text(
                value,
                textAlign: TextAlign.end,
                style: tokens.typography.small.copyWith(
                  color: c.foreground,
                  fontWeight: FontWeight.w600,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            if (trailing case final trailing?) ...[
              const SizedBox(width: AppSpacing.sm),
              trailing,
            ],
          ],
        ),
      ),
    );
  }
}

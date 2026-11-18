import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// The yellow "Needs you" container: an ink pill and the reason.
class FleetNeedsYouCallout extends StatelessWidget {
  const FleetNeedsYouCallout({this.reason, this.maxLines, super.key});

  final String? reason;

  /// Null shows the whole reason.
  final int? maxLines;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final yellow = DynamicColors.of(context).yellow;
    final text = reason?.trim();
    return Semantics(
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(8, 7, 10, 7),
        decoration: BoxDecoration(
          color: yellow.withValues(alpha: colors.isDark ? 0.2 : 0.14),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: yellow.withValues(alpha: 0.4)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: colors.foreground,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                l10n.fleetStatusNeedsUser,
                style: TextStyle(
                  color: colors.background,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text == null || text.isEmpty
                    ? l10n.fleetNeedsYouFallback
                    : text,
                maxLines: maxLines,
                overflow: maxLines == null ? null : TextOverflow.ellipsis,
                style: TextStyle(
                  color: colors.foreground,
                  fontSize: 12,
                  height: 1.25,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A "Blocked by" line with the reason.
class FleetBlockedByRow extends StatelessWidget {
  const FleetBlockedByRow({required this.blockedBy, this.maxLines, super.key});

  final String blockedBy;
  final int? maxLines;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final red = DynamicColors.of(context).red;
    return Semantics(
      container: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(Icons.block_rounded, size: 13, color: red),
          ),
          const SizedBox(width: 5),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: '${context.l10n.fleetBlockedBy}  ',
                    style: TextStyle(color: red, fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: blockedBy),
                ],
              ),
              maxLines: maxLines,
              overflow: maxLines == null ? null : TextOverflow.ellipsis,
              style: TextStyle(
                color: colors.mutedForeground,
                fontSize: 11,
                height: 1.25,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

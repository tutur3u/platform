import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';

/// Two-way switch used by finance forms, such as Basic / Transfer or
/// Category / Tag, with the finance accent on the selected side.
///
/// The selected face sits [inset] inside the track's outer edge on every
/// side (the 1 px track border plus [trackPadding]) and its corners are the
/// track's minus that inset, so both curves share a centre.
class FinanceSegmentedRow extends StatelessWidget {
  const FinanceSegmentedRow({
    required this.leftLabel,
    required this.rightLabel,
    required this.leftSelected,
    required this.onLeftPressed,
    required this.onRightPressed,
    super.key,
  });

  final String leftLabel;
  final String rightLabel;
  final bool leftSelected;
  final VoidCallback onLeftPressed;
  final VoidCallback onRightPressed;

  static const double trackRadius = 18;
  static const double borderWidth = 1;
  static const double trackPadding = 3;

  /// Gap between the track's outer edge and a segment on every side, and
  /// between the two segments.
  static const double inset = borderWidth + trackPadding;

  /// Corners of a segment inside the [trackRadius] track.
  static const double segmentRadius = trackRadius - inset;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final accent = FinancePalette.of(context).accent;

    return Container(
      padding: const EdgeInsets.all(trackPadding),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(trackRadius),
        border: Border.all(color: c.border.withValues(alpha: 0.72)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _FinanceSegment(
              label: leftLabel,
              selected: leftSelected,
              accent: accent,
              onPressed: onLeftPressed,
            ),
          ),
          const SizedBox(width: inset),
          Expanded(
            child: _FinanceSegment(
              label: rightLabel,
              selected: !leftSelected,
              accent: accent,
              onPressed: onRightPressed,
            ),
          ),
        ],
      ),
    );
  }
}

class _FinanceSegment extends StatelessWidget {
  const _FinanceSegment({
    required this.label,
    required this.selected,
    required this.accent,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final Color accent;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    const radius = BorderRadius.all(
      Radius.circular(FinanceSegmentedRow.segmentRadius),
    );

    return Semantics(
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: radius,
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: selected
                  ? accent.withValues(alpha: 0.14)
                  : Colors.transparent,
              borderRadius: radius,
            ),
            child: Center(
              child: Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.small.copyWith(
                  fontWeight: FontWeight.w700,
                  color: selected ? accent : tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

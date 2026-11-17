import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/components/app_tap_target.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// One segment of an [AppSegmentedControl].
@immutable
class AppSegment<T> {
  const AppSegment({required this.value, required this.label, this.icon});

  final T value;
  final String label;
  final IconData? icon;
}

/// Equal-width switch between two to four modes of the same content, such
/// as Day / Week / Month or Self / Team. Use `AppFilterBar` instead when the
/// choices filter a list or there are more than four.
///
/// The selected segment is raised on a muted track, with the design's
/// control corners. It fills the track inside an equal [trackPadding] on
/// every side, and its corners are the track's minus that padding, so both
/// curves share a centre. Selection changes repaint only the control; there
/// is no sliding animation to keep it cheap.
class AppSegmentedControl<T> extends StatelessWidget {
  const AppSegmentedControl({
    required this.segments,
    required this.selected,
    required this.onChanged,
    super.key,
  }) : assert(
         segments.length >= 2 && segments.length <= 4,
         'Use two to four segments',
       );

  final List<AppSegment<T>> segments;
  final T selected;
  final ValueChanged<T>? onChanged;

  /// Gap between the track and the selected segment on every side.
  static const double trackPadding = AppSpacing.xs;

  /// Corners of the selected segment inside a track with [trackRadius].
  static double selectedRadius(double trackRadius) =>
      AppShapes.inset(trackRadius, trackPadding);

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.muted.withValues(alpha: solid ? 1 : 0.8),
        borderRadius: BorderRadius.circular(tokens.shapes.segment),
        border: solid ? Border.all(color: c.border) : null,
      ),
      child: Padding(
        padding: const EdgeInsets.all(trackPadding),
        child: Row(
          children: [
            for (final segment in segments)
              Expanded(
                child: _Segment(
                  segment: segment,
                  selected: segment.value == selected,
                  onTap: onChanged == null
                      ? null
                      : () => onChanged!(segment.value),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.segment,
    required this.selected,
    required this.onTap,
  });

  final AppSegment<Object?> segment;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final foreground = selected ? c.foreground : c.mutedForeground;
    final outline = tokens.depth.outlined || MediaQuery.highContrastOf(context);
    final radius = AppSegmentedControl.selectedRadius(tokens.shapes.segment);
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: AppControlTarget(
        onTap: onTap,
        radius: radius,
        // The face spans the whole target so the gap to the track stays
        // equal on every side.
        child: Container(
          constraints: const BoxConstraints(minHeight: kAppMinTapTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          decoration: selected
              ? BoxDecoration(
                  color: c.background,
                  borderRadius: BorderRadius.circular(radius),
                  border: outline ? Border.all(color: c.border) : null,
                  boxShadow: tokens.depth.selection,
                )
              : null,
          // Centred at the content's height, never stretched to the parent.
          child: Align(
            heightFactor: 1,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (segment.icon case final icon?) ...[
                  Icon(icon, size: 16, color: foreground),
                  const SizedBox(width: AppSpacing.xs + 2),
                ],
                Flexible(
                  child: Text(
                    segment.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.uiCompact.copyWith(
                      color: foreground,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

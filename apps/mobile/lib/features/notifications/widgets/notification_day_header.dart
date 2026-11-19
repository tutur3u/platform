import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// Height of a sticky day header in the notifications feed.
const double notificationDayHeaderHeight = 36;

/// Pinned Today / Yesterday / Earlier caption. It stays transparent over
/// the page background until rows scroll beneath it, then paints the
/// background; the next group's header pushes it away.
class NotificationDayHeaderDelegate extends SliverPersistentHeaderDelegate {
  const NotificationDayHeaderDelegate({required this.label});

  final String label;

  @override
  double get minExtent => notificationDayHeaderHeight;

  @override
  double get maxExtent => notificationDayHeaderHeight;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Semantics(
      header: true,
      child: ColoredBox(
        color: shrinkOffset > 0 || overlapsContent
            ? c.background
            : Colors.transparent,
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(
              start: AppSpacing.xs,
              top: AppSpacing.xs,
            ),
            child: Text(
              label,
              style: tokens.typography.small.copyWith(
                color: c.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(NotificationDayHeaderDelegate oldDelegate) =>
      oldDelegate.label != label;
}

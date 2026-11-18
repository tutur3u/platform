import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/profile/view/profile_timeline_filter.dart';

/// Source chips above the timeline. At most one is selected; tapping it
/// again shows every source. The dock's All clears it too.
class ProfileTimelineSourceChips extends StatelessWidget {
  const ProfileTimelineSourceChips({
    required this.selected,
    required this.onSelected,
    required this.padding,
    super.key,
  });

  /// Null when every source is shown.
  final ProfileTimelineSource? selected;
  final ValueChanged<ProfileTimelineSource?> onSelected;

  /// Page gutters; the strip scrolls edge to edge.
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: const ValueKey('timeline-source-chips'),
      scrollDirection: Axis.horizontal,
      padding: EdgeInsets.only(left: padding.left, right: padding.right),
      child: Row(
        children: [
          for (final (index, source)
              in ProfileTimelineSource.values.indexed) ...[
            if (index > 0) const SizedBox(width: AppSpacing.sm),
            AppChip(
              key: ValueKey('timeline-source-${source.name}'),
              label: Text(source.label(context)),
              selected: source == selected,
              onSelected: (_) => onSelected(source == selected ? null : source),
            ),
          ],
        ],
      ),
    );
  }
}

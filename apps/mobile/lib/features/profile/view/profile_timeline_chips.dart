import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/profile/view/profile_timeline_filter.dart';
import 'package:mobile/l10n/l10n.dart';

/// One-choice source chips above the timeline: All, then each source.
class ProfileTimelineSourceChips extends StatelessWidget {
  const ProfileTimelineSourceChips({
    required this.selected,
    required this.onSelected,
    required this.padding,
    super.key,
  });

  /// Null selects All.
  final ProfileTimelineSource? selected;
  final ValueChanged<ProfileTimelineSource?> onSelected;

  /// Page gutters; the strip scrolls edge to edge.
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final options = <(ProfileTimelineSource?, String)>[
      (null, context.l10n.profileTimelineSourceAll),
      for (final source in ProfileTimelineSource.values)
        (source, source.label(context)),
    ];
    return SingleChildScrollView(
      key: const ValueKey('timeline-source-chips'),
      scrollDirection: Axis.horizontal,
      padding: EdgeInsets.only(left: padding.left, right: padding.right),
      child: Row(
        children: [
          for (final (index, (source, label)) in options.indexed) ...[
            if (index > 0) const SizedBox(width: AppSpacing.sm),
            AppChip(
              key: ValueKey('timeline-source-${source?.name ?? 'all'}'),
              label: Text(label),
              selected: source == selected,
              inMutuallyExclusiveGroup: true,
              onSelected: (_) => onSelected(source),
            ),
          ],
        ],
      ),
    );
  }
}

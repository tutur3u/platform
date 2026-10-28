import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/l10n/l10n.dart';

/// Needs you and Decisions: two views of the same Inbox tab.
class InboxSegmentBar extends StatelessWidget {
  const InboxSegmentBar({
    required this.selected,
    required this.onChanged,
    super.key,
  });

  final InboxSegment selected;
  final ValueChanged<InboxSegment> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: AppSegmentedControl<InboxSegment>(
        selected: selected,
        onChanged: onChanged,
        segments: [
          AppSegment(
            value: InboxSegment.needsYou,
            label: l10n.mastermindNeedsYouTitle,
          ),
          AppSegment(
            value: InboxSegment.decisions,
            label: l10n.mastermindDecisionsSegment,
          ),
        ],
      ),
    );
  }
}

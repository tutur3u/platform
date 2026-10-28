import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';
import 'package:mobile/l10n/l10n.dart';

/// Needs you, Resolved and All filter the asks; Decisions is the journal.
/// Four views of the same Inbox tab in one compact control.
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
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: MastermindSegmentedControl<InboxSegment>(
        selected: selected,
        onChanged: onChanged,
        segments: [
          AppSegment(
            value: InboxSegment.needsYou,
            label: l10n.mastermindNeedsYouTitle,
          ),
          AppSegment(
            value: InboxSegment.resolved,
            label: l10n.mastermindInboxResolvedSegment,
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

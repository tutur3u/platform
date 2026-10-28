import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_adaptive_grid.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/activity_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/view/home/count_tile.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

export 'package:mobile/features/mastermind/view/home/count_tile.dart';

/// Running, Waiting, Idle and Failed as four tappable tiles, then a muted
/// footnote for queued and not-reporting lanes. Four across; two by two once
/// text is scaled past 130%.
class MastermindActivityStrip extends StatelessWidget {
  const MastermindActivityStrip({required this.activity, super.key});

  final MastermindActivity activity;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final large = mastermindLargeText(context);
    final footnote = [
      if (activity.source == ActivitySource.lanes) l10n.mastermindFromLanes,
      if (activity.source == ActivitySource.fleet) l10n.mastermindFromFleet,
      if (activity.queued > 0) l10n.mastermindQueuedCount(activity.queued),
      if (activity.notReporting > 0)
        l10n.mastermindNotReportingCount(activity.notReporting),
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppAdaptiveGrid(
            minTileWidth: large ? 120 : 64,
            maxColumns: large ? 2 : 4,
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            equalHeight: true,
            children: [
              MastermindCountTile(
                state: LaneState.running,
                count: activity.running,
                label: l10n.mastermindActivityRunning,
                icon: LucideIcons.play,
              ),
              MastermindCountTile(
                state: LaneState.waiting,
                count: activity.waiting,
                label: l10n.mastermindActivityWaiting,
                icon: LucideIcons.hourglass,
              ),
              MastermindCountTile(
                state: LaneState.idle,
                count: activity.idle,
                label: l10n.mastermindActivityIdle,
                icon: LucideIcons.pause,
              ),
              MastermindCountTile(
                state: LaneState.failed,
                count: activity.failed,
                label: l10n.mastermindActivityFailed,
                icon: activity.failed > 0
                    ? AppIcons.warning
                    : LucideIcons.circleX,
                tone: activity.failed > 0
                    ? AppTone.destructive
                    : AppTone.neutral,
              ),
            ],
          ),
          if (activity.waitingOnYou > 0)
            InkWell(
              onTap: () => context.go(inboxLocation()),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    l10n.mastermindWaitingOnYou(activity.waitingOnYou),
                  ),
                ),
              ),
            ),
          if (footnote.isNotEmpty)
            _Footnote(text: footnote, activity: activity),
        ],
      ),
    );
  }
}

class _Footnote extends StatelessWidget {
  const _Footnote({required this.text, required this.activity});

  final String text;
  final MastermindActivity activity;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final line = Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Text(
        text,
        style: tokens.typography.small.copyWith(
          color: tokens.colorScheme.mutedForeground,
        ),
      ),
    );
    // Only queued lanes have a list to open; "not reporting" is a footnote.
    if (activity.queued == 0) {
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: line,
      );
    }
    return Semantics(
      button: true,
      child: InkWell(
        onTap: () => context.go(workLocation(state: LaneState.queued)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: AppInterfaceTokens.minTouchTarget,
          ),
          child: Align(alignment: Alignment.centerLeft, child: line),
        ),
      ),
    );
  }
}

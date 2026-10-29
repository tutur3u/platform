import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/l10n/l10n.dart';

/// A lane state as a glyph and a word, never colour alone. Failed lanes carry
/// the warning tone.
class LaneStateBadge extends StatelessWidget {
  const LaneStateBadge({required this.state, this.reason, super.key});

  final LaneState state;
  final String? reason;

  static IconData icon(LaneState state) => switch (state) {
    LaneState.failed => AppIcons.warning,
    LaneState.running => LucideIcons.play,
    LaneState.waiting => LucideIcons.hourglass,
    LaneState.queued => LucideIcons.list,
    LaneState.completed => AppIcons.check,
    LaneState.cancelled || LaneState.withdrawn => LucideIcons.circleX,
    LaneState.answered => AppIcons.check,
    LaneState.open => LucideIcons.circleDot,
    _ => AppIcons.info,
  };

  @override
  Widget build(BuildContext context) => MastermindStatusChip(
    tone: state == LaneState.failed ? AppTone.warning : AppTone.neutral,
    icon: icon(state),
    label: state == LaneState.unknown
        ? reason ?? MastermindLabels.laneState(context.l10n, state)
        : MastermindLabels.laneState(context.l10n, state),
  );
}

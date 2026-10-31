import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/threads/threads_flag.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/work/lane_state_badge.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/work/lane/:laneId`: one lane in full. Read-only: a lane has no
/// action a phone can take.
///
/// The id is an opaque snapshot id used only to look the lane up. If it is not
/// in the snapshot any more the page says so and offers the way back; it is
/// never an error.
class MastermindLanePage extends StatefulWidget {
  const MastermindLanePage({required this.laneId, super.key});

  final String laneId;

  @override
  State<MastermindLanePage> createState() => _MastermindLanePageState();
}

class _MastermindLanePageState extends State<MastermindLanePage> {
  /// The state first shown here, to notice a lane that moved on.
  LaneState? _openedState;

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final lane = laneById(ready.snapshot, widget.laneId);
      if (lane != null) _openedState ??= lane.state;
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverToBoxAdapter(
            child: lane == null
                ? _Gone(wasShown: _openedState != null)
                : _Detail(lane: lane, updated: lane.state != _openedState),
          ),
        ],
      );
    },
  );
}

class _Gone extends StatelessWidget {
  const _Gone({required this.wasShown});

  /// The lane was on screen and then left the snapshot.
  final bool wasShown;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final threads = mastermindThreadsEnabled;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxxl),
      child: AppStateMessage(
        icon: threads ? LucideIcons.messagesSquare : LucideIcons.briefcase,
        title: wasShown
            ? l10n.mastermindLaneFinishedTitle
            : l10n.mastermindLaneGoneTitle,
        actionLabel: threads
            ? l10n.mastermindBackToThreads
            : l10n.mastermindBackToWork,
        onAction: () =>
            context.go(threads ? '/mastermind/threads' : Routes.mastermindWork),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.lane, required this.updated});

  final Lane lane;
  final bool updated;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final age = lane.ageSeconds;
    final eta = lane.etaSeconds;
    Widget row(String label, Widget value) =>
        AppGroupedRow(title: Text(label), trailing: value);
    Widget text(String value) => Text(value, textAlign: TextAlign.end);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ShellTitleOverride(
          ownerId: 'mastermind-lane',
          locations: {Routes.mastermindWorkLanePath(lane.id)},
          title: lane.title,
          showLeadingBrand: false,
        ),
        if (updated)
          MastermindGroup(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(
                  icon: AppIcons.info,
                  tone: AppTone.warning,
                ),
                title: Text(l10n.mastermindLaneUpdated),
              ),
            ],
          ),
        // The title is the shell's title override above; the body repeats none.
        MastermindGroup(
          children: [
            row(
              l10n.mastermindLaneState,
              LaneStateBadge(
                state: lane.state,
                reason: lane.fields['state']?.reason(l10n),
              ),
            ),
            row(l10n.mastermindLaneRole, text(HubField.text(l10n, lane.role))),
            row(
              l10n.mastermindLaneModel,
              text(HubField.text(l10n, lane.providerModel)),
            ),
            row(
              l10n.mastermindLaneAge,
              text(
                age == null
                    ? l10n.mastermindUnknown
                    : mastermindDurationText(l10n, Duration(seconds: age)),
              ),
            ),
            if (eta != null)
              row(
                l10n.mastermindLaneEtaLabel,
                text(mastermindDurationText(l10n, Duration(seconds: eta))),
              ),
            if (lane.product case final product?)
              row(
                l10n.mastermindLaneProduct,
                text(MastermindLabels.product(product)),
              ),
            if (lane.area case final area?)
              row(
                l10n.mastermindLaneArea,
                text(MastermindLabels.area(l10n, area)),
              ),
            if (lane.kind case final kind?)
              row(
                l10n.mastermindLaneKind,
                text(MastermindLabels.laneKind(l10n, kind)),
              ),
          ],
        ),
      ],
    );
  }
}

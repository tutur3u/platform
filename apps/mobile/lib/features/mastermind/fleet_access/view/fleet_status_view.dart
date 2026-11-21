import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_status_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_labels.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_notice.dart';
import 'package:mobile/features/mastermind/presentation/relative_time.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/l10n/l10n.dart';

/// Status: lane totals, then each project's latest snapshot with when it was
/// generated and received, flagged once it is over an hour old.
class FleetStatusView extends StatelessWidget {
  const FleetStatusView({required this.cubit, this.now, super.key});

  final FleetStatusCubit cubit;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<FleetStatusCubit, FleetStatusState>(
        bloc: cubit,
        builder: (context, state) {
          final digest = state.digest;
          if (digest == null) {
            if (state.failure case final failure?) {
              return FleetAccessFailureMessage(
                failure: failure,
                onRetry: () => unawaited(cubit.load()),
              );
            }
            return const AppSkeletonRows(count: 4);
          }
          return FleetClock(
            period: const Duration(minutes: 1),
            now: now,
            builder: (context, current) =>
                _Digest(digest: digest, failure: state.failure, now: current),
          );
        },
      );
}

class _Digest extends StatelessWidget {
  const _Digest({required this.digest, required this.now, this.failure});

  final FleetDigest digest;
  final FleetAccessFailure? failure;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (failure case final failure?) ...[
          FleetAccessNotice(failure: failure),
          const SizedBox(height: AppSpacing.md),
        ],
        AppAdaptiveGrid(
          minTileWidth: 140,
          equalHeight: true,
          children: [
            AppStatTile(
              label: l10n.mastermindFleetAccessKpiLanes,
              value: '${digest.lanes}',
              icon: LucideIcons.layers,
            ),
            for (final state in const [
              FleetLaneState.running,
              FleetLaneState.blocked,
              FleetLaneState.ready,
            ])
              AppStatTile(
                label: switch (state) {
                  FleetLaneState.running =>
                    l10n.mastermindFleetAccessKpiRunning,
                  FleetLaneState.blocked =>
                    l10n.mastermindFleetAccessKpiBlocked,
                  _ => l10n.mastermindFleetAccessKpiReady,
                },
                value: '${digest.count(state)}',
                icon: switch (state) {
                  FleetLaneState.running => LucideIcons.activity,
                  FleetLaneState.blocked => LucideIcons.octagonAlert,
                  _ => LucideIcons.circleCheck,
                },
                tone: digest.count(state) == 0 ? AppTone.neutral : state.tone,
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        if (digest.sections.isEmpty)
          AppStateMessage.inline(
            icon: LucideIcons.clock,
            title: l10n.mastermindFleetAccessNoDigest,
          )
        else
          for (final section in digest.sections)
            FleetDigestSectionGroup(section: section, now: now),
      ],
    );
  }
}

/// One project: its received and generated times, a stale badge, and its
/// lanes.
class FleetDigestSectionGroup extends StatelessWidget {
  const FleetDigestSectionGroup({
    required this.section,
    required this.now,
    super.key,
  });

  final FleetDigestSection section;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final meta = tokens.typography.xSmall.copyWith(
      color: tokens.colorScheme.mutedForeground,
    );
    return MastermindGroup(
      caption: section.projectKey,
      captionTrailing: section.staleAt(now)
          ? MastermindStatusChip(
              key: ValueKey('fleet-access-stale-${section.projectKey}'),
              label: l10n.mastermindFleetAccessStale,
              icon: LucideIcons.clock,
              tone: AppTone.warning,
            )
          : null,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppLayout.rowHorizontalPadding,
            vertical: AppSpacing.sm,
          ),
          child: Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.xs,
            children: [
              MastermindTimeLabel(
                section.receivedAt,
                sentence: l10n.mastermindFleetAccessReceived,
                style: meta,
              ),
              MastermindTimeLabel(
                section.generatedAt,
                sentence: l10n.mastermindFleetAccessGenerated,
                style: meta,
              ),
            ],
          ),
        ),
        if (section.lanes.isEmpty)
          MastermindListRow(title: l10n.mastermindFleetAccessNoLanes)
        else
          for (final lane in section.lanes) _LaneRow(lane: lane, now: now),
      ],
    );
  }
}

class _LaneRow extends StatelessWidget {
  const _LaneRow({required this.lane, required this.now});

  final FleetDigestLane lane;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final eta = lane.eta;
    final details = [
      ?lane.releaseTitle,
      ?lane.readinessItem,
      if (eta != null)
        l10n.mastermindFleetAccessEta(
          mastermindAbsoluteTimeText(
            eta,
            now: now,
            zone: mastermindTimeZoneOf(context),
            locale: Localizations.localeOf(context).toLanguageTag(),
          ),
        ),
      ?lane.shortSha,
      ...lane.blockers.map((b) => b.label(l10n)),
    ];
    return MastermindListRow(
      title: lane.lane,
      subtitle: details.isEmpty ? null : details.join(' · '),
      trailing: MastermindStatusChip(
        label: lane.state.label(l10n),
        tone: lane.state.tone,
      ),
    );
  }
}

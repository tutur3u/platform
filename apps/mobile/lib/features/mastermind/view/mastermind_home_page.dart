import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/view/home_activity_card.dart';
import 'package:mobile/features/mastermind/view/home_lanes_ship_cards.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/home_quota_decisions_cards.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/pending_replies_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_sources_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind`: the overview, Needs-you first.
class MastermindHomePage extends StatelessWidget {
  const MastermindHomePage({super.key});

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final model = MastermindHomeModel.from(ready.snapshot);
      return MastermindRepliesWatcher(
        child: AppPageScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: MastermindFreshnessStrip(freshness: freshness),
            ),
            SliverList.list(
              children: [
                _SourcesAction(sources: ready.snapshot.sources),
                HomeNeedsYouCard(model: model),
                const PendingRepliesSection(),
                HomeLanesCard(model: model),
                HomeShipCard(model: model),
                HomeQuotaCard(model: model),
                HomeActivityCard(model: model),
                // Last: the Decisions journal is deferred, so this is only the
                // latest few, with no link to a fuller view.
                HomeDecisionsCard(model: model),
              ],
            ),
          ],
        ),
      );
    },
  );
}

/// The "Data sources" navbar action, always on Home, not only while a source
/// is degraded.
class _SourcesAction extends StatelessWidget {
  const _SourcesAction({required this.sources});

  final List<Source> sources;

  @override
  Widget build(BuildContext context) => ShellChromeActions(
    ownerId: 'mastermind-home',
    locations: const {Routes.mastermind},
    actions: [
      ShellActionSpec(
        id: 'mastermind-sources',
        icon: LucideIcons.database,
        tooltip: context.l10n.mastermindDataSourcesAction,
        callbackToken: sources
            .map((source) => '${source.source.name}:${source.state.name}')
            .join(','),
        onPressed: () =>
            unawaited(showMastermindSourcesSheet(context, sources: sources)),
      ),
    ],
  );
}

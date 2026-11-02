import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/catchup/catchup_refresh.dart';
import 'package:mobile/features/mastermind/catchup/catchup_section.dart';
import 'package:mobile/features/mastermind/catchup/catchup_settings_sheet.dart';
import 'package:mobile/features/mastermind/machines/machine_list.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/mastermind/view/home/activity_strip.dart';
import 'package:mobile/features/mastermind/view/home_activity_card.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/home_quota_decisions_cards.dart';
import 'package:mobile/features/mastermind/view/home_ship_card.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/pending_replies_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_sources_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind`, the Today tab: the catch-up digest first, then true activity
/// counts, what needs you, Ship, Usage, recent activity and decisions, each
/// capped.
class MastermindHomePage extends StatefulWidget {
  const MastermindHomePage({super.key});

  @override
  State<MastermindHomePage> createState() => _MastermindHomePageState();
}

class _MastermindHomePageState extends State<MastermindHomePage> {
  final _refresh = CatchupRefreshController();

  @override
  void dispose() {
    _refresh.dispose();
    super.dispose();
  }

  void _catchMeUp() {
    final runtime = context.read<MastermindRuntime>();
    unawaited(_refresh.track(refreshMastermindSnapshot(runtime)));
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    onPullRefresh: (outcome) => unawaited(_refresh.track(outcome)),
    builder: (context, ready, freshness) {
      final model = MastermindHomeModel.from(ready.snapshot);
      return MastermindRepliesWatcher(
        // Outside the scroll view: a lazy sliver child is disposed once it
        // scrolls away, which would unregister the navbar action.
        child: Column(
          children: [
            Expanded(
              child: AppPageScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: MastermindFreshnessStrip(
                      freshness: freshness,
                      showWhenHealthy: true,
                    ),
                  ),
                  SliverList.list(
                    children: [
                      if (ready.snapshot.catchup case final digest?)
                        CatchupSection(
                          digest: digest,
                          freshness: freshness,
                          refresh: _refresh,
                          onCatchMeUp: _catchMeUp,
                          clock: context
                              .read<MastermindRuntime>()
                              .snapshot
                              .clock,
                        ),
                      MastermindActivityStrip(activity: model.lanes),
                      HomeNeedsYouCard(model: model),
                      HomeMachinesRow(snapshot: ready.snapshot.machines),
                      const PendingRepliesSection(),
                      HomeShipCard(model: model),
                      HomeQuotaCard(model: model),
                      HomeActivityCard(model: model),
                      // Last: only the latest few, with a link to the journal.
                      HomeDecisionsCard(model: model),
                    ],
                  ),
                ],
              ),
            ),
            _SourcesAction(sources: ready.snapshot.sources),
          ],
        ),
      );
    },
  );
}

/// The navbar actions, always on Today: Catch-up settings and Data sources
/// (not only while a source is degraded).
class _SourcesAction extends StatelessWidget {
  const _SourcesAction({required this.sources});

  final List<Source> sources;

  @override
  Widget build(BuildContext context) => ShellChromeActions(
    ownerId: 'mastermind-home',
    locations: const {Routes.mastermind},
    actions: [
      ShellActionSpec(
        id: 'mastermind-catchup-settings',
        icon: LucideIcons.sunrise,
        tooltip: context.l10n.mastermindCatchupSettingsAction,
        onPressed: () => unawaited(showCatchupSettingsSheet(context)),
      ),
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

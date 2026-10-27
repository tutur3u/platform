import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/l10n/l10n.dart';

enum MastermindTab { inbox, work, ship, insights }

/// The Inbox, Work, Ship and Insights tabs until they are built. They already
/// sit behind the same access gate, freshness strip and section states.
class MastermindPlaceholderPage extends StatelessWidget {
  const MastermindPlaceholderPage({required this.tab, super.key});

  final MastermindTab tab;

  static String label(AppLocalizations l10n, MastermindTab tab) =>
      switch (tab) {
        MastermindTab.inbox => l10n.mastermindTabInbox,
        MastermindTab.work => l10n.mastermindTabWork,
        MastermindTab.ship => l10n.mastermindTabShip,
        MastermindTab.insights => l10n.mastermindTabInsights,
      };

  static IconData icon(MastermindTab tab) => switch (tab) {
    MastermindTab.inbox => LucideIcons.inbox,
    MastermindTab.work => LucideIcons.briefcase,
    MastermindTab.ship => LucideIcons.rocket,
    MastermindTab.insights => LucideIcons.chartLine,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return MastermindSection(
      builder: (context, ready, freshness) => AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxxl),
              child: AppStateMessage(
                icon: icon(tab),
                title: l10n.mastermindTabSoonTitle(label(l10n, tab)),
                message: l10n.mastermindTabSoonMessage,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

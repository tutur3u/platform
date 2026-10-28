import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/view/home_activity_card.dart';
import 'package:mobile/features/mastermind/view/home_lanes_ship_cards.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/home_quota_decisions_cards.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';

/// `/mastermind`: the overview, Needs-you first.
class MastermindHomePage extends StatelessWidget {
  const MastermindHomePage({super.key});

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final model = MastermindHomeModel.from(ready.snapshot);
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverList.list(
            children: [
              HomeNeedsYouCard(model: model),
              HomeLanesCard(model: model),
              HomeShipCard(model: model),
              HomeQuotaCard(model: model),
              HomeDecisionsCard(model: model),
              HomeActivityCard(model: model),
            ],
          ),
        ],
      );
    },
  );
}

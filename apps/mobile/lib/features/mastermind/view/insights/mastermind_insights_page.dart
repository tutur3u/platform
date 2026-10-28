import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/features/mastermind/view/insights/usage_credits_section.dart';
import 'package:mobile/features/mastermind/view/insights/usage_pool_card.dart';
import 'package:mobile/features/mastermind/view/insights/usage_quota_sections.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/insights`: usage and quota. Each pool keeps its own budget and
/// chart, the Codex pools add their credits, and the quota table and forecasts
/// close the page. Read-only. The other Insights sections arrive later and
/// share the chart Table route this page already uses.
class MastermindInsightsPage extends StatelessWidget {
  const MastermindInsightsPage({super.key});

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final l10n = context.l10n;
      final model = MastermindUsageModel.from(ready.snapshot);
      UsageChartSpec? chart(UsageChartKind kind, String label) =>
          usageChartSpec(l10n, model, usageChartId(kind, label));
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverList.list(
            children: [
              if (model.gaps.isNotEmpty)
                AppGroupedSection.spaced(
                  children: [
                    for (final gap in model.gaps)
                      AppGroupedRow(
                        title: Text(
                          l10n.mastermindGapSummary(
                            Gmt7.time(gap.start, l10n.localeName),
                            Gmt7.time(gap.end, l10n.localeName),
                            gap.label(l10n),
                          ),
                        ),
                      ),
                  ],
                ),
              if (model.isEmpty)
                AppGroupedSection.spaced(
                  caption: l10n.mastermindScopeUsage,
                  children: [
                    AppGroupedRow(
                      leading: const AppIconTile(icon: LucideIcons.chartLine),
                      title: Text(l10n.mastermindUsageEmpty),
                    ),
                  ],
                )
              else ...[
                // No source: the plots are left out, so say why once.
                if (!model.plottable)
                  AppGroupedSection.spaced(
                    caption: l10n.mastermindScopeUsage,
                    children: [
                      AppGroupedRow(
                        leading: const AppIconTile(icon: AppIcons.info),
                        title: Text(
                          MastermindLabels.coverage(l10n, model.coverage),
                        ),
                      ),
                    ],
                  ),
                for (final pool in model.pools)
                  UsagePoolCard(
                    pool: pool,
                    chart: chart(UsageChartKind.budget, pool.label),
                  ),
                for (final pool in model.credits)
                  UsageCreditsSection(
                    pool: pool,
                    balance: chart(UsageChartKind.credits, pool.label),
                    burn: chart(UsageChartKind.burn, pool.label),
                  ),
                UsageQuotaSection(quotas: model.quotas),
                UsageForecastsSection(forecasts: model.forecasts),
                const _ReservePacingNote(),
              ],
            ],
          ),
        ],
      );
    },
  );
}

/// Pacing is the chart's reserve check, not the routing decision.
class _ReservePacingNote extends StatelessWidget {
  const _ReservePacingNote();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final style = Theme.of(context).textTheme.bodySmall;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.mastermindReservePacing, style: style),
          Text(l10n.mastermindReservePacingInfo, style: style),
        ],
      ),
    );
  }
}

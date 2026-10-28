import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/features/mastermind/view/insights/usage_chart_panel.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/insights/:section/table/:chartId`: the rows behind one chart,
/// the same series the panel draws. The ids are route parameters only, used to
/// pick the chart out of the current snapshot; one the snapshot no longer has
/// says so and offers the way back, it is never an error.
class MastermindChartTablePage extends StatelessWidget {
  const MastermindChartTablePage({
    required this.section,
    required this.chartId,
    super.key,
  });

  final String section;
  final String chartId;

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final l10n = context.l10n;
      final spec = section == usageSection
          ? usageChartSpec(
              l10n,
              MastermindUsageModel.from(ready.snapshot),
              chartId,
            )
          : null;
      final table = spec?.table(l10n);
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          if (spec == null || table == null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxxl),
                child: AppStateMessage(
                  icon: LucideIcons.chartLine,
                  title: l10n.mastermindChartGoneTitle,
                  actionLabel: l10n.mastermindBackToInsights,
                  onAction: () => context.go(Routes.mastermindInsights),
                ),
              ),
            )
          else ...[
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ShellTitleOverride(
                    ownerId: 'mastermind-chart-table',
                    locations: {
                      Routes.mastermindInsightsTablePath(section, chartId),
                    },
                    title: '${spec.label} · ${spec.title}',
                    showLeadingBrand: false,
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: Text(spec.summary),
                  ),
                ],
              ),
            ),
            SliverList.builder(
              itemCount: table.rows.length,
              itemBuilder: (context, index) =>
                  ChartTableRow(data: table, index: index),
            ),
          ],
        ],
      );
    },
  );
}

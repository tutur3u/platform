import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/features/mastermind/view/widgets/reported_text.dart';
import 'package:mobile/features/mastermind/view/widgets/show_all_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// Compact pool rows, the three most urgent first: opaque pool label, session
/// budget left, pacing as word plus shape, and a sparkline of the session
/// series. A missing reading reads `—`, never "unknown".
class HomeQuotaCard extends StatelessWidget {
  const HomeQuotaCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedSection.spaced(
      caption: l10n.mastermindQuotaTitle,
      footer: l10n.mastermindReservePacing,
      children: [
        // Collapse only when every pool is known and none reports: with
        // hidden pools a reading may sit behind "Show all".
        if (model.quotaPoolCount == model.quotaPools.length &&
            model.quotaPools.every(
              (pool) => pool.latest.session.remainingPercent == null,
            ))
          AppGroupedRow(title: Text(l10n.mastermindQuotaEmpty))
        else
          for (final pool in model.quotaPools) _QuotaRow(pool: pool),
        if (model.quotaPoolCount > model.quotaPools.length)
          MastermindShowAllRow(
            count: model.quotaPoolCount,
            onTap: () => context.go(Routes.mastermindInsights),
          )
        else
          AppGroupedRow(
            title: Text(l10n.mastermindUsageLink),
            showChevron: true,
            onTap: () => context.go(Routes.mastermindInsights),
          ),
      ],
    );
  }
}

class _QuotaRow extends StatelessWidget {
  const _QuotaRow({required this.pool});

  final UsagePool pool;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final remaining = pool.latest.session.remainingPercent;
    final pacing = pool.latest.session.pacing;
    final points = [
      for (final point in pool.series)
        ChartPoint(t: point.t, y: point.session.remainingPercent),
    ];
    return AppGroupedRow(
      // Pool labels are opaque display strings, rendered verbatim.
      title: Text(pool.label),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (remaining == null)
            Row(
              children: [
                Text(l10n.mastermindSession),
                const SizedBox(width: AppSpacing.xs),
                ReportedText(
                  null,
                  field: pool.latest.session.fields['remaining_percent'],
                ),
              ],
            )
          else
            Text(
              l10n.mastermindSessionLeft(
                l10n.mastermindUnitPercent(remaining.round().toString()),
              ),
            ),
          if (points.length > 1)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Sparkline(
                height: 28,
                series: ChartSeries(
                  id: pool.label,
                  label: pool.label,
                  slot: 0,
                  points: points,
                ),
                axis: ChartValueAxis.percent,
                summary:
                    '${pool.label} · ${l10n.mastermindChartSessionRemaining} · '
                    '${l10n.mastermindSamples(points.length)}',
              ),
            ),
        ],
      ),
      // No pacing reads `—`, not the dashed glyph that looks like a spinner.
      trailing: pacing == null
          ? ReportedText(null, field: pool.latest.session.fields['pacing'])
          : StatusGlyph(
              status: switch (pacing) {
                Pacing.short => ChartStatus.short,
                Pacing.ok => ChartStatus.ok,
                Pacing.surplus => ChartStatus.surplus,
              },
              label: MastermindLabels.pacing(pacing),
            ),
    );
  }
}

/// The latest three journal decisions, newest first. A row opens its detail,
/// pushed over Home so Back returns here; "See all decisions" opens the
/// Decisions segment of the Inbox.
class HomeDecisionsCard extends StatelessWidget {
  const HomeDecisionsCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedSection.spaced(
      caption: l10n.mastermindRecentDecisionsTitle,
      children: [
        if (model.decisions.isEmpty)
          AppGroupedRow(title: Text(l10n.mastermindDecisionsEmpty)),
        for (final decision in model.decisions)
          AppGroupedRow(
            title: Text(decision.title),
            subtitle: MastermindTimeLabel(
              decision.at,
              sentence: (time) => [
                if (decision case JournalDecision(:final category))
                  MastermindLabels.decisionCategory(l10n, category),
                time,
              ].join(' · '),
            ),
            showChevron: true,
            onTap: () =>
                context.push(Routes.mastermindInboxDecisionPath(decision.id)),
          ),
        if (model.decisions.isNotEmpty)
          AppGroupedRow(
            title: Text(l10n.mastermindDecisionsSeeAll),
            showChevron: true,
            onTap: () =>
                context.go(inboxLocation(segment: InboxSegment.decisions)),
          ),
      ],
    );
  }
}

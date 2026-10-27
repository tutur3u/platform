import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// Compact pool rows: opaque pool label, session budget left, pacing as word
/// plus shape, and a sparkline of the session series.
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
        if (model.quotaPools.isEmpty)
          AppGroupedRow(title: Text(l10n.mastermindQuotaEmpty)),
        for (final pool in model.quotaPools) _QuotaRow(pool: pool),
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

  final QuotaPool pool;

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
          Text(
            remaining == null
                ? l10n.mastermindUnavailable
                : l10n.mastermindSessionLeft(
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
      trailing: StatusGlyph(
        status: switch (pacing) {
          Pacing.short => ChartStatus.short,
          Pacing.ok => ChartStatus.ok,
          Pacing.surplus => ChartStatus.surplus,
          null => ChartStatus.unknown,
        },
        label: pacing == null
            ? l10n.mastermindStateUnknown
            : MastermindLabels.pacing(pacing),
      ),
    );
  }
}

/// The latest three journal decisions, newest first.
class HomeDecisionsCard extends StatelessWidget {
  const HomeDecisionsCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    return AppGroupedSection.spaced(
      caption: l10n.mastermindRecentDecisionsTitle,
      children: [
        if (model.decisions.isEmpty)
          AppGroupedRow(title: Text(l10n.mastermindDecisionsEmpty)),
        for (final decision in model.decisions)
          AppGroupedRow(
            title: Text(decision.title),
            subtitle: Text(
              [
                if (decision case JournalDecision(:final category))
                  MastermindLabels.decisionCategory(l10n, category),
                Gmt7.dateTime(decision.at, locale),
              ].join(' · '),
            ),
            // Decisions have no detail screen yet: no tap until Inbox lands.
          ),
      ],
    );
  }
}

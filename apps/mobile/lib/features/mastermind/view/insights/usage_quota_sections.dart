import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/view/ship/ship_capped_section.dart';
import 'package:mobile/l10n/l10n.dart';

/// The quota table: how much each pool had left and how long ago that was
/// read, least left first and capped at five. The pool labels include
/// `Unknown account`.
class UsageQuotaSection extends StatelessWidget {
  const UsageQuotaSection({required this.quotas, super.key});

  final List<ProductQuota> quotas;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ShipCappedSection(
      caption: l10n.mastermindQuotaTitle,
      empty: AppGroupedRow(title: Text(l10n.mastermindQuotaEmpty)),
      rows: [
        for (final quota in quotas)
          AppGroupedRow(
            title: Text(quota.instance),
            // No read age: the line is left out rather than saying so.
            subtitle: quota.ageSeconds == null
                ? null
                : Text(
                    l10n.mastermindSummaryAsOf(
                      mastermindAgeText(
                        l10n,
                        Duration(seconds: quota.ageSeconds!),
                      ),
                    ),
                  ),
            trailing: Text(
              quota.remainingPercent == null
                  ? l10n.mastermindUnavailable
                  : l10n.mastermindUnitPercent(
                      usageNumber(quota.remainingPercent!),
                    ),
            ),
          ),
      ],
    );
  }
}

/// When each pool is projected to run out, or that it is not before its reset,
/// soonest first and capped at five.
class UsageForecastsSection extends StatelessWidget {
  const UsageForecastsSection({required this.forecasts, super.key});

  final List<QuotaForecast> forecasts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ShipCappedSection(
      caption: l10n.mastermindUsageForecastsTitle,
      rows: [
        for (final forecast in forecasts)
          AppGroupedRow(
            title: Text(forecast.instance),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  forecast.projectedEmptyAt == null
                      ? l10n.mastermindForecastNone
                      : l10n.mastermindForecastEmptyAt(
                          Gmt7.dateTime(
                            forecast.projectedEmptyAt!,
                            l10n.localeName,
                          ),
                        ),
                ),
                if (forecast.resetsAt case final resets?)
                  Text(
                    l10n.mastermindResetsAt(
                      Gmt7.dateTime(resets, l10n.localeName),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

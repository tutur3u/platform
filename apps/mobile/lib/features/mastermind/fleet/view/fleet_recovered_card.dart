import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Lanes that ended without counting as failures: cancelled duplicates,
/// lanes resumed after a usage limit and retries that passed. Kept apart
/// from the Failed figure so the headline counts only real failures. Shows
/// nothing when every count is zero or Web left them out.
class FleetRecoveredCard extends StatelessWidget {
  const FleetRecoveredCard({required this.counts, super.key});

  final FleetCounts counts;

  @override
  Widget build(BuildContext context) {
    if (counts.resolved == 0) return const SizedBox.shrink();
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return AppCard(
      child: MergeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.mastermindFleetRecoveredTitle,
                    style: tokens.typography.p.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Text(
                  '${counts.resolved}',
                  style: tokens.typography.large.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              l10n.mastermindFleetRecoveredBreakdown(
                counts.cancelled,
                counts.quotaRecovered,
                counts.recovered,
              ),
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_status_chip.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_status_visuals.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_callouts.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_format.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';
import 'package:mobile/l10n/l10n.dart';

/// The compact structured block under a fleet card's title: status chip,
/// owner, ETA and staleness, then the needs-you callout or, failing that,
/// the blocked-by row.
class FleetTaskTileBlock extends StatelessWidget {
  const FleetTaskTileBlock({required this.meta, this.now, super.key});

  final FleetTaskMeta meta;

  /// Reference time for ETA and staleness; the clock when null.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final palette = DynamicColors.of(context);
    final clock = now ?? DateTime.now();
    final locale = Localizations.localeOf(context).toLanguageTag();
    final staleness = meta.staleness(now: clock);
    final etaState = meta.etaState(now: clock);

    var updatedText = fleetUpdatedLabel(l10n, meta.lastUpdate, now: clock);
    if (staleness == FleetStaleness.stale) {
      updatedText = '$updatedText · ${l10n.fleetStale}';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            FleetStatusChip(status: meta.displayStatus),
            _FleetMetaItem(
              icon: Icons.person_outline_rounded,
              text: meta.owner ?? l10n.fleetOwnerUnowned,
              color: colors.mutedForeground,
            ),
            _FleetMetaItem(
              icon: Icons.schedule_rounded,
              text: fleetEtaLabel(l10n, meta, now: clock, locale: locale),
              color: fleetEtaColor(etaState, palette, colors.mutedForeground),
              bold: etaState == FleetEtaState.overdue,
            ),
            _FleetMetaItem(
              icon: Icons.update_rounded,
              text: updatedText,
              color: fleetStalenessColor(
                staleness,
                palette,
                colors.mutedForeground,
              ),
              bold: staleness == FleetStaleness.stale,
            ),
          ],
        ),
        if (meta.needsUser) ...[
          const SizedBox(height: 8),
          FleetNeedsYouCallout(reason: meta.needsUserReason, maxLines: 2),
        ] else if (meta.isBlocked) ...[
          const SizedBox(height: 8),
          FleetBlockedByRow(
            blockedBy: meta.blockedBy,
            blockedByCount: meta.blockedByCount,
            maxLines: 2,
          ),
        ],
      ],
    );
  }
}

class _FleetMetaItem extends StatelessWidget {
  const _FleetMetaItem({
    required this.icon,
    required this.text,
    required this.color,
    this.bold = false,
  });

  final IconData icon;
  final String text;
  final Color color;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 3),
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

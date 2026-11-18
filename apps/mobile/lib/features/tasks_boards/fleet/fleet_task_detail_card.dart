import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_status_chip.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_status_visuals.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_callouts.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_format.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_link_chips.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';
import 'package:mobile/l10n/l10n.dart';

/// The fleet section of the task detail sheet: a fields grid (Status, Owner,
/// ETA, Updated), the needs-you callout or blocked-by row, and every link.
class FleetTaskDetailCard extends StatelessWidget {
  const FleetTaskDetailCard({required this.meta, this.now, super.key});

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
    final stamp = DateFormat.MMMd(locale).add_jm();
    final eta = meta.eta;
    final lastUpdate = meta.lastUpdate;

    return Container(
      key: const ValueKey('fleet-task-detail-card'),
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _FleetField(
                  label: l10n.fleetFieldStatus,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FleetStatusChip(status: meta.displayStatus),
                  ),
                ),
              ),
              Expanded(
                child: _FleetField(
                  label: l10n.fleetFieldOwner,
                  child: _FieldText(
                    meta.owner ?? l10n.fleetOwnerUnowned,
                    color: meta.owner == null
                        ? colors.mutedForeground
                        : colors.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _FleetField(
                  label: l10n.fleetFieldEta,
                  child: _FieldText(
                    fleetEtaLabel(l10n, meta, now: clock, locale: locale),
                    color: fleetEtaColor(etaState, palette, colors.foreground),
                    detail: eta == null ? null : stamp.format(eta.toLocal()),
                  ),
                ),
              ),
              Expanded(
                child: _FleetField(
                  label: l10n.fleetFieldUpdated,
                  child: _FieldText(
                    fleetUpdatedLabel(l10n, lastUpdate, now: clock),
                    color: fleetStalenessColor(
                      staleness,
                      palette,
                      colors.mutedForeground,
                    ),
                    detail: lastUpdate == null
                        ? null
                        : stamp.format(lastUpdate.toLocal()),
                  ),
                ),
              ),
            ],
          ),
          if (meta.needsUser) ...[
            const SizedBox(height: 12),
            FleetNeedsYouCallout(reason: meta.needsUserReason),
          ] else if (meta.isBlocked) ...[
            const SizedBox(height: 12),
            FleetBlockedByRow(
              blockedBy: meta.blockedBy,
              blockedByCount: meta.blockedByCount,
            ),
          ],
          if (meta.links.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              l10n.fleetLinksTitle,
              style: TextStyle(
                color: colors.mutedForeground,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            FleetTaskLinkChips(links: meta.links),
          ],
        ],
      ),
    );
  }
}

class _FleetField extends StatelessWidget {
  const _FleetField({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    return Semantics(
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: colors.mutedForeground,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          child,
        ],
      ),
    );
  }
}

class _FieldText extends StatelessWidget {
  const _FieldText(this.text, {required this.color, this.detail});

  final String text;
  final Color color;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          text,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: color,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (detail != null)
          Text(
            detail!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: colors.mutedForeground, fontSize: 11),
          ),
      ],
    );
  }
}

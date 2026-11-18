import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_status_visuals.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';
import 'package:mobile/l10n/l10n.dart';

/// The status as a word with an icon (or a quiet dot) and its tone.
class FleetStatusChip extends StatelessWidget {
  const FleetStatusChip({required this.status, super.key});

  final FleetStatus? status;

  @override
  Widget build(BuildContext context) {
    final visual = fleetStatusVisual(
      status,
      DynamicColors.of(context),
      context.l10n,
    );
    final icon = visual.icon;
    return Container(
      padding: const EdgeInsets.fromLTRB(7, 3, 9, 3),
      decoration: BoxDecoration(
        color: visual.color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: visual.color.withValues(alpha: 0.32)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon == null)
            Container(
              width: 7,
              height: 7,
              margin: const EdgeInsets.symmetric(horizontal: 2),
              decoration: BoxDecoration(
                color: visual.color,
                shape: BoxShape.circle,
              ),
            )
          else
            Icon(icon, size: 13, color: visual.color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              visual.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: visual.color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

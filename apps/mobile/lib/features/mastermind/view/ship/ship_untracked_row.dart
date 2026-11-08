import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/l10n/l10n.dart';

/// The products with nothing observed, as one "Not tracked yet" row that
/// names them. Tapping it lists each one with the hub's reason when it gave
/// one (for example "Not connected"), otherwise "No deployments observed".
class ShipUntrackedRow extends StatefulWidget {
  const ShipUntrackedRow({required this.groups, super.key});

  final List<ShipProductGroup> groups;

  @override
  State<ShipUntrackedRow> createState() => _ShipUntrackedRowState();
}

class _ShipUntrackedRowState extends State<ShipUntrackedRow> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final names = [
      for (final group in widget.groups)
        MastermindLabels.releaseProduct(group.product),
    ];
    return MastermindGroup(
      children: [
        Semantics(
          expanded: _expanded,
          child: AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.eyeOff),
            title: Text(l10n.mastermindShipUntracked),
            subtitle: Text(
              names.join(', '),
              maxLines: _expanded ? null : 2,
              overflow: _expanded ? null : TextOverflow.ellipsis,
            ),
            trailing: Icon(
              _expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
              size: 18,
            ),
            onTap: () => setState(() => _expanded = !_expanded),
          ),
        ),
        if (_expanded)
          for (final (index, group) in widget.groups.indexed)
            AppGroupedRow(
              title: Text(names[index]),
              subtitle: Text(_reason(l10n, group)),
            ),
      ],
    );
  }

  static String _reason(AppLocalizations l10n, ShipProductGroup group) {
    for (final row in group.environments) {
      for (final key in const ['deploy_status', 'ci_state']) {
        final field = row.fields[key];
        if (field != null && field.status != 'ok') return field.reason(l10n);
      }
    }
    return l10n.mastermindShipNoDeployments;
  }
}

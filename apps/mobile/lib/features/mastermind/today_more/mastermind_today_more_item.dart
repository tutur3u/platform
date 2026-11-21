import 'package:flutter/widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// One destination in Today's More menu.
@immutable
class MastermindTodayMoreItem {
  const MastermindTodayMoreItem({
    required this.id,
    required this.label,
    required this.icon,
    required this.route,
    this.visible,
  });

  final String id;
  final String Function(AppLocalizations l10n) label;
  final IconData icon;

  /// The location the item pushes.
  final String route;

  /// Whether the item shows, read during the menu's build so the menu follows
  /// it; null always shows. It only hides the entry: the destination and the
  /// API enforce access.
  final bool Function(BuildContext context)? visible;
}

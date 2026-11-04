import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

typedef AppLabelBuilder = String Function(AppLocalizations l10n);
typedef AppVisibility = bool Function(BuildContext context);
typedef MiniAppLabelBuilder = String Function(AppLocalizations l10n);
typedef MiniAppVisibility = bool Function(BuildContext context);

typedef AppPageBuilder = WidgetBuilder;

@immutable
class MiniAppNavItem {
  const MiniAppNavItem({
    required this.id,
    required this.route,
    required this.icon,
    required this.labelBuilder,
    this.isVisible,
    this.aliasRoutes = const [],
  });

  final String id;
  final String route;

  /// Other location prefixes that keep this item selected in the dock, for a
  /// pushed detail whose path is not under [route].
  final List<String> aliasRoutes;
  final IconData icon;
  final MiniAppLabelBuilder labelBuilder;
  final MiniAppVisibility? isVisible;

  String label(AppLocalizations l10n) => labelBuilder(l10n);

  bool visibleIn(BuildContext context) => isVisible?.call(context) ?? true;
}

@immutable
class AppModule {
  const AppModule({
    required this.id,
    required this.route,
    required this.icon,
    required this.labelBuilder,
    required this.pageBuilder,
    required this.miniAppNavItems,
    this.isVisible,
  });

  final String id;
  final String route;
  final IconData icon;
  final AppLabelBuilder labelBuilder;
  final AppPageBuilder pageBuilder;
  final List<MiniAppNavItem> miniAppNavItems;
  final AppVisibility? isVisible;

  String label(AppLocalizations l10n) => labelBuilder(l10n);

  bool visibleIn(BuildContext context) => isVisible?.call(context) ?? true;

  List<MiniAppNavItem> miniAppNavItemsFor(BuildContext context) {
    return miniAppNavItems
        .where((item) => item.visibleIn(context))
        .toList(growable: false);
  }
}

/// The dock item [location] belongs to: the longest matching [MiniAppNavItem]
/// route or alias prefix, or the first item when none match.
int miniNavSelectedIndex(String location, List<MiniAppNavItem> items) {
  if (items.isEmpty) {
    return 0;
  }

  String normalize(String value) {
    var normalized = value;
    while (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  final normalizedLocation = normalize(location);
  var bestIndex = 0;
  var bestMatchLength = -1;

  for (var index = 0; index < items.length; index++) {
    for (final candidate in [items[index].route, ...items[index].aliasRoutes]) {
      final route = normalize(candidate);
      final isMatch =
          normalizedLocation == route ||
          normalizedLocation.startsWith('$route/');
      if (isMatch && route.length > bestMatchLength) {
        bestMatchLength = route.length;
        bestIndex = index;
      }
    }
  }

  return bestMatchLength >= 0 ? bestIndex : 0;
}

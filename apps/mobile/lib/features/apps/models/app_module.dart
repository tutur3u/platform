import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

typedef AppLabelBuilder = String Function(AppLocalizations l10n);
typedef AppVisibility = bool Function(BuildContext context);
typedef MiniAppLabelBuilder = String Function(AppLocalizations l10n);

typedef AppPageBuilder = WidgetBuilder;

@immutable
class MiniAppNavItem {
  const MiniAppNavItem({
    required this.id,
    required this.route,
    required this.icon,
    required this.labelBuilder,
  });

  final String id;
  final String route;
  final IconData icon;
  final MiniAppLabelBuilder labelBuilder;

  String label(AppLocalizations l10n) => labelBuilder(l10n);
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
    this.isPinned = false,
    this.isVisible,
  });

  final String id;
  final String route;
  final IconData icon;
  final AppLabelBuilder labelBuilder;
  final AppPageBuilder pageBuilder;
  final List<MiniAppNavItem> miniAppNavItems;
  final bool isPinned;
  final AppVisibility? isVisible;

  String label(AppLocalizations l10n) => labelBuilder(l10n);

  bool visibleIn(BuildContext context) => isVisible?.call(context) ?? true;
}

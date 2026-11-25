import 'package:flutter/material.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/l10n/l10n.dart';

String? shellSidebarDestinationTitle(
  BuildContext context, {
  required AppModule? activeModule,
  required ShellMiniNavRegistration? registration,
  required int Function(List<MiniAppNavItem>) selectedIndex,
}) {
  final selected = registration?.items
      .where((item) => item.selected)
      .firstOrNull;
  if (selected != null) return selected.label;
  if (activeModule == null) return null;
  final items = activeModule.miniAppNavItemsFor(context);
  return items.isEmpty
      ? activeModule.label(context.l10n)
      : items[selectedIndex(items)].label(context.l10n);
}

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/command_palette/palette_entry.dart';
import 'package:mobile/features/command_palette/palette_shortcuts.dart';
import 'package:mobile/l10n/l10n.dart';

List<PaletteEntry> paletteCatalog(
  BuildContext context,
  List<AppModule> apps, {
  required bool inMira,
}) {
  final l10n = context.l10n;
  String hint(PaletteShortcut shortcut) =>
      shortcut.hint(defaultTargetPlatform, l10n);

  return [
    for (final shortcut in PaletteShortcut.values)
      if (shortcut.tab case final tab?)
        PaletteEntry(
          id: 'tab-${tab.name}',
          label: shortcut.label(l10n),
          group: PaletteGroup.destinations,
          route: tab.route,
          shortcut: hint(shortcut),
        ),
    PaletteEntry(
      id: 'settings',
      label: l10n.settingsTitle,
      group: PaletteGroup.destinations,
      route: Routes.settings,
      shortcut: hint(PaletteShortcut.settings),
    ),
    for (final app in apps)
      if (app.route != Routes.settings)
        PaletteEntry(
          id: 'app-${app.id}',
          label: app.label(l10n),
          group: PaletteGroup.apps,
          route: app.route,
          appId: app.id,
        ),
    PaletteEntry(
      id: 'new-chat',
      label: l10n.commandPaletteNewChat,
      group: PaletteGroup.actions,
      action: PaletteAction.newChat,
      shortcut: inMira ? hint(PaletteShortcut.newItem) : null,
    ),
    PaletteEntry(
      id: 'new-task',
      label: l10n.taskBoardDetailCreateTask,
      group: PaletteGroup.actions,
      action: PaletteAction.newTask,
      shortcut: inMira ? null : hint(PaletteShortcut.newItem),
    ),
    PaletteEntry(
      id: 'theme',
      label: l10n.commandPaletteToggleTheme,
      group: PaletteGroup.actions,
      action: PaletteAction.toggleTheme,
    ),
    PaletteEntry(
      id: 'workspace',
      label: l10n.commandPaletteSwitchWorkspace,
      group: PaletteGroup.actions,
      action: PaletteAction.switchWorkspace,
    ),
    PaletteEntry(
      id: 'shortcuts',
      label: l10n.commandPaletteShortcuts,
      group: PaletteGroup.actions,
      action: PaletteAction.shortcuts,
      shortcut: hint(PaletteShortcut.help),
    ),
  ];
}

List<PaletteEntry> rankPaletteCommands(
  List<PaletteEntry> entries,
  String query,
  List<String> recentIds,
) {
  if (query.isNotEmpty) {
    return rankPaletteMatches(
      entries,
      (entry) => paletteMatchScore(entry.label, query),
    );
  }
  final byId = {for (final entry in entries) entry.id: entry};
  final recent = recentIds.map(byId.remove).nonNulls;
  return [
    for (final entry in recent)
      PaletteEntry(
        id: entry.id,
        label: entry.label,
        group: PaletteGroup.recent,
        route: entry.route,
        action: entry.action,
        appId: entry.appId,
        shortcut: entry.shortcut,
      ),
    ...byId.values,
  ];
}

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/command_palette/palette_shortcuts.dart';
import 'package:mobile/l10n/l10n.dart';

class PaletteShortcutHelp extends StatelessWidget {
  const PaletteShortcutHelp({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.commandPaletteShortcuts,
      slivers: [
        SliverList.list(
          children: [
            for (final shortcut in PaletteShortcut.values)
              AppListTile(
                title: Text(shortcut.label(l10n)),
                subtitle: shortcut == PaletteShortcut.newItem
                    ? Text(l10n.commandPaletteNewItemDescription)
                    : null,
                trailing: Text(shortcut.hint(defaultTargetPlatform, l10n)),
              ),
            AppListTile(
              title: Text(l10n.commandPaletteMoveSelection),
              trailing: const Text('↑ / ↓'),
            ),
            AppListTile(
              title: Text(l10n.commandPaletteRunSelection),
              trailing: Text(l10n.commandPaletteEnterKey),
            ),
            AppListTile(
              title: Text(MaterialLocalizations.of(context).closeButtonTooltip),
              trailing: Text(l10n.commandPaletteEscapeKey),
            ),
          ],
        ),
      ],
    );
  }
}

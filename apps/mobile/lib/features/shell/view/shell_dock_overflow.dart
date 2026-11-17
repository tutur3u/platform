import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_option_tile.dart';
import 'package:mobile/core/ui/kit/app_grouped_slice.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/l10n/l10n.dart';

/// Most destinations the dock pill shows; more collapse behind a More slot.
const int shellDockMaxSlots = 5;

/// Key of the dock's More slot.
const shellDockMoreKey = ValueKey<String>('shell-dock-more');

/// Splits [entries] into the slots the pill shows and the ones behind More.
///
/// Up to [maxSlots] (at most [shellDockMaxSlots]) entries show as they are.
/// Beyond that the pill shows one fewer and a More slot, so slots never
/// shrink below a usable width however many destinations a section
/// registers.
({List<ShellDockEntry> visible, List<ShellDockEntry> overflow})
splitShellDockEntries(
  List<ShellDockEntry> entries, {
  int maxSlots = shellDockMaxSlots,
}) {
  final slots = maxSlots.clamp(2, shellDockMaxSlots);
  if (entries.length <= slots) {
    return (visible: entries, overflow: const []);
  }
  final shown = slots - 1;
  return (visible: entries.sublist(0, shown), overflow: entries.sublist(shown));
}

/// Lists the destinations behind the dock's More slot and resolves with the
/// chosen entry's key, or null when dismissed.
Future<Key?> showShellDockOverflowSheet({
  required BuildContext context,
  required List<ShellDockEntry> entries,
  required Key? selectedKey,
}) => showAppSheet<Key>(
  context: context,
  builder: (sheetContext) => AppSheetScaffold(
    title: sheetContext.l10n.navMore,
    slivers: [
      SliverList.builder(
        itemCount: entries.length,
        itemBuilder: (context, index) {
          final entry = entries[index];
          return AppGroupedSlice(
            position: AppSlicePosition.of(index, entries.length),
            dividerInset: AppSpacing.md,
            child: AppOptionTile(
              key: ValueKey(('shell-dock-overflow', entry.key)),
              title: entry.label,
              leading: IconTheme.merge(
                data: const IconThemeData(size: 22),
                child: SizedBox.square(dimension: 22, child: entry.glyph),
              ),
              selected: entry.key == selectedKey,
              onTap: entry.enabled
                  ? () => Navigator.of(context).pop(entry.key)
                  : null,
            ),
          );
        },
      ),
    ],
  ),
);

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/cubit/shell_dock_action_group.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_more_sheet.dart';
import 'package:mobile/features/shell/view/shell_dock_overflow.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of an action group's More slot.
const shellDockGroupMoreKey = ValueKey<String>('shell-dock-group-more');

/// Key of the pill slot for the group action [id].
ValueKey<(String, String)> shellDockGroupSlotKey(String id) =>
    ValueKey(('shell-dock-group-slot', id));

/// Splits [group] into the pill slots that fit [maxSlots] and the More
/// sections.
///
/// The More slot takes one slot whenever there are More sections. Actions
/// that do not fit fold into a first More section, in order, so the pill
/// never shrinks a slot below [ShellDockMetrics.minSlotWidth].
({List<ShellDockGroupAction> visible, List<List<ShellDockMoreItem>> more})
splitShellDockActionGroup(ShellDockActionGroup group, {required int maxSlots}) {
  final actions = group.pillActions;
  final sections = group.moreSections;
  final slots = maxSlots.clamp(1, shellDockMaxSlots);
  if (actions.length + (sections.isEmpty ? 0 : 1) <= slots) {
    return (visible: actions, more: sections);
  }
  final shown = (slots - 1).clamp(0, actions.length);
  return (
    visible: actions.sublist(0, shown),
    more: [actions.sublist(shown), ...sections],
  );
}

/// The pill of a registered [ShellDockActionGroup], drawn inside the shell
/// dock's one material.
///
/// Slots are momentary buttons: they share the destination slots' layout and
/// labels but never show the selection highlight.
class ShellDockActionGroupBar extends StatelessWidget {
  const ShellDockActionGroupBar({required this.group, super.key});

  final ShellDockActionGroup group;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    return SizedBox(
      key: const ValueKey('shell-dock-action-group'),
      height: ShellDockMetrics.height - ShellDockSurface.edge * 2,
      child: Padding(
        padding: const EdgeInsets.all(
          ShellDockMetrics.padding - ShellDockSurface.edge,
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final (:visible, :more) = splitShellDockActionGroup(
              group,
              maxSlots: (constraints.maxWidth / ShellDockMetrics.minSlotWidth)
                  .floor(),
            );
            final count = visible.length + (more.isEmpty ? 0 : 1);
            final slotWidth = count == 0 ? 0.0 : constraints.maxWidth / count;
            final showLabel = slotWidth >= ShellDockMetrics.minSlotWidth;
            return Row(
              children: [
                for (final action in visible)
                  Expanded(
                    child: ShellDockSlotButton(
                      key: shellDockGroupSlotKey(action.id),
                      entry: ShellDockEntry(
                        key: shellDockGroupSlotKey(action.id),
                        label: action.label,
                        glyph: Icon(action.icon),
                        enabled: action.enabled && action.onPressed != null,
                      ),
                      selected: false,
                      showLabel: showLabel,
                      style: style,
                      onTap: () {
                        unawaited(AppHaptics.selection());
                        action.onPressed?.call();
                      },
                    ),
                  ),
                if (more.isNotEmpty)
                  Expanded(
                    child: ShellDockSlotButton(
                      key: shellDockGroupMoreKey,
                      entry: ShellDockEntry(
                        key: shellDockGroupMoreKey,
                        label: context.l10n.navMore,
                        glyph: const Icon(Icons.more_horiz),
                      ),
                      selected: false,
                      showLabel: showLabel,
                      style: style,
                      onTap: () {
                        unawaited(AppHaptics.selection());
                        unawaited(
                          showShellDockMoreSheet(
                            context: context,
                            sections: more,
                          ),
                        );
                      },
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

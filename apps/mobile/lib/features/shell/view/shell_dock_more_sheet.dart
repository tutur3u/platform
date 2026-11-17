import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_controls.dart';
import 'package:mobile/core/ui/components/app_list_tile.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/shell/cubit/shell_dock_action_group.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the More-sheet row for the item [id].
ValueKey<(String, String)> shellDockMoreItemKey(String id) =>
    ValueKey(('shell-dock-more-item', id));

/// Key of the segmented choice of the More-sheet choice row [id].
ValueKey<(String, String)> shellDockMoreChoiceKey(String id) =>
    ValueKey(('shell-dock-more-choice', id));

/// Key of the separator before More-sheet section [index].
ValueKey<(String, int)> shellDockMoreSeparatorKey(int index) =>
    ValueKey(('shell-dock-more-separator', index));

/// Opens the More sheet of a dock action group.
///
/// The sheet registers as a modal, so the dock hides while it is open and
/// returns once it closes. An action row closes the sheet first and then
/// runs, so an action that opens its own sheet or route starts from the
/// restored page. A choice row applies immediately and keeps the sheet open.
Future<void> showShellDockMoreSheet({
  required BuildContext context,
  required List<List<ShellDockMoreItem>> sections,
}) async {
  final chosen = await showAppSheet<ShellDockGroupAction>(
    context: context,
    builder: (sheetContext) => AppSheetScaffold(
      title: sheetContext.l10n.navMore,
      child: ShellDockMoreSheetBody(sections: sections),
    ),
  );
  if (chosen != null && chosen.enabled) chosen.onPressed?.call();
}

/// The More sheet's sections, separated by hairlines.
class ShellDockMoreSheetBody extends StatelessWidget {
  const ShellDockMoreSheetBody({required this.sections, super.key});

  final List<List<ShellDockMoreItem>> sections;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (index, section) in sections.indexed) ...[
          if (index > 0)
            Padding(
              key: shellDockMoreSeparatorKey(index),
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: const AppDivider(),
            ),
          for (final item in section)
            switch (item) {
              ShellDockGroupAction() => _ActionRow(
                key: shellDockMoreItemKey(item.id),
                action: item,
              ),
              ShellDockChoice() => _ChoiceRow(
                key: shellDockMoreItemKey(item.id),
                choice: item,
              ),
            },
        ],
      ],
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.action, super.key});

  final ShellDockGroupAction action;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final color = action.destructive ? c.destructive : null;
    return AppListTile(
      leading: Icon(action.icon, color: color),
      title: Text(action.label, style: TextStyle(color: color)),
      enabled: action.enabled && action.onPressed != null,
      onTap: () => Navigator.of(context).pop(action),
    );
  }
}

class _ChoiceRow extends StatefulWidget {
  const _ChoiceRow({required this.choice, super.key});

  final ShellDockChoice choice;

  @override
  State<_ChoiceRow> createState() => _ChoiceRowState();
}

class _ChoiceRowState extends State<_ChoiceRow> {
  // The sheet is built once; the selection is tracked here so it shows at
  // once while the owner applies it.
  late String _selected = widget.choice.selectedId;

  @override
  void didUpdateWidget(_ChoiceRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.choice.selectedId != widget.choice.selectedId) {
      _selected = widget.choice.selectedId;
    }
  }

  @override
  Widget build(BuildContext context) {
    final choice = widget.choice;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppListTile(leading: Icon(choice.icon), title: Text(choice.label)),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.sm,
          ),
          child: Semantics(
            label: choice.label,
            container: true,
            child: AppSegmentedControl<String>(
              key: shellDockMoreChoiceKey(choice.id),
              segments: [
                for (final option in choice.options)
                  AppSegment(value: option.id, label: option.label),
              ],
              selected: _selected,
              onChanged: (id) {
                if (id == _selected) return;
                setState(() => _selected = id);
                choice.onSelected(id);
              },
            ),
          ),
        ),
      ],
    );
  }
}

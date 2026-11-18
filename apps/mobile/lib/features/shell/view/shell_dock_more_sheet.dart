import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_controls.dart';
import 'package:mobile/core/ui/components/app_list_tile.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/shell/cubit/shell_dock_action_group.dart';
import 'package:mobile/features/shell/view/shell_dock_control.dart';
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
    forceBottomSheet: true,
    builder: (sheetContext) => AppSheetScaffold(
      title: sheetContext.l10n.navMore,
      child: ShellDockMoreSheetBody(sections: sections),
    ),
  );
  if (context.mounted && chosen != null && chosen.enabled) {
    chosen.onPressed?.call();
  }
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
  Widget build(BuildContext context) => ShellDockMoreRow(
    leading: Icon(action.icon),
    label: action.label,
    destructive: action.destructive,
    onTap: action.enabled && action.onPressed != null
        ? () => Navigator.of(context).pop(action)
        : null,
  );
}

/// A More sheet row uses the inset of [AppSheetScaffold]'s body from the
/// sheet edge to keep the corner and focus outline concentric.
class ShellDockMoreRow extends StatelessWidget {
  const ShellDockMoreRow({
    required this.leading,
    required this.label,
    this.onTap,
    this.selected,
    this.destructive = false,
    super.key,
  });

  final Widget leading;
  final String label;
  final VoidCallback? onTap;
  final bool? selected;
  final bool destructive;

  static double radiusOf(BuildContext context) =>
      AppShapes.inset(AppTokens.of(context).shapes.sheet, AppSpacing.lg);

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final color = destructive ? c.destructive : null;
    final enabled = onTap != null;
    return Semantics(
      container: true,
      excludeSemantics: true,
      label: label,
      onTap: onTap,
      button: true,
      enabled: enabled,
      selected: selected,
      inMutuallyExclusiveGroup: selected != null,
      child: ShellDockControl(
        borderRadius: BorderRadius.circular(radiusOf(context)),
        onTap: onTap,
        child: Opacity(
          opacity: enabled ? 1 : 0.5,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppLayout.rowCompactMinHeight,
            ),
            child: AppListTile(
              leading: IconTheme.merge(
                data: IconThemeData(color: color),
                child: leading,
              ),
              title: Text(
                label,
                style: TextStyle(
                  color: color,
                  fontWeight: selected == true ? FontWeight.w600 : null,
                ),
              ),
              trailing: selected == true
                  ? Icon(Icons.check, color: c.primary)
                  : null,
            ),
          ),
        ),
      ),
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
    return ClipRRect(
      borderRadius: BorderRadius.circular(ShellDockMoreRow.radiusOf(context)),
      child: Column(
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
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/grouped_section.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_option_tile.dart';
import 'package:mobile/core/ui/kit/app_grouped_slice.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// One choice in an [AppActionSheet].
///
/// Tapping it closes the sheet with [value], or runs [onPressed] when the
/// caller manages closing itself (for example to pop before a picker opens).
class AppSheetAction<T> {
  const AppSheetAction({
    required this.label,
    this.icon,
    this.value,
    this.onPressed,
    this.tone = AppTone.neutral,
    this.destructive = false,
    this.enabled = true,
    this.key,
  });

  final String label;
  final IconData? icon;
  final T? value;
  final FutureOr<void> Function()? onPressed;

  /// Tint of the leading icon tile. [destructive] overrides it.
  final AppTone tone;
  final bool destructive;
  final bool enabled;
  final Key? key;
}

/// A menu of actions in the shared sheet: the [AppSheetScaffold] header and
/// insets around one grouped card of icon rows.
///
/// Use it for every "more", "add" or "choose an action" menu instead of
/// stacking list tiles in a bare sheet body, so all menus share the drag
/// handle, close button, keyboard and dock clearance.
class AppActionSheet<T> extends StatelessWidget {
  const AppActionSheet({
    required this.title,
    required this.actions,
    this.description,
    super.key,
  });

  final String title;
  final String? description;
  final List<AppSheetAction<T>> actions;

  @override
  Widget build(BuildContext context) => AppSheetScaffold(
    title: title,
    description: description,
    child: AppGroupedCard(
      children: [for (final action in actions) _ActionRow<T>(action: action)],
    ),
  );
}

class _ActionRow<T> extends StatelessWidget {
  const _ActionRow({required this.action});

  final AppSheetAction<T> action;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final enabled = action.enabled;
    final tone = !enabled
        ? AppTone.neutral
        : action.destructive
        ? AppTone.destructive
        : action.tone;
    final row = AppGroupedRow(
      key: action.key,
      leading: action.icon == null
          ? null
          : AppIconTile(icon: action.icon!, tone: tone),
      title: Text(
        action.label,
        style: !enabled
            ? TextStyle(color: c.mutedForeground)
            : action.destructive
            ? TextStyle(color: c.destructive)
            : null,
      ),
      onTap: enabled ? () => _activate(context) : null,
    );
    return enabled ? row : Semantics(enabled: false, button: true, child: row);
  }

  void _activate(BuildContext context) {
    final onPressed = action.onPressed;
    if (onPressed != null) {
      unawaited(Future.sync(onPressed));
      return;
    }
    Navigator.of(context).pop(action.value);
  }
}

/// Opens an [AppActionSheet] and resolves with the chosen action's value,
/// or null when the sheet is dismissed.
Future<T?> showAppActionSheet<T>({
  required BuildContext context,
  required String title,
  required List<AppSheetAction<T>> actions,
  String? description,
  bool useRootNavigator = false,
}) => showAppSheet<T>(
  context: context,
  useRootNavigator: useRootNavigator,
  builder: (_) => AppActionSheet<T>(
    title: title,
    description: description,
    actions: actions,
  ),
);

/// One option of an [AppChoiceSheet].
class AppSheetChoice<T> {
  const AppSheetChoice({
    required this.value,
    required this.label,
    this.subtitle,
    this.icon,
    this.key,
  });

  final T value;
  final String label;
  final String? subtitle;
  final IconData? icon;
  final Key? key;
}

/// A single-choice picker in the shared sheet: check-marked options in one
/// lazily built grouped card. Selecting an option closes the sheet with its
/// value. `AppSelect` opens this sheet too.
class AppChoiceSheet<T> extends StatelessWidget {
  const AppChoiceSheet({
    required this.title,
    required this.choices,
    required this.selected,
    this.description,
    super.key,
  });

  final String title;
  final String? description;
  final List<AppSheetChoice<T>> choices;
  final T? selected;

  @override
  Widget build(BuildContext context) => AppSheetScaffold(
    title: title,
    description: description,
    slivers: [
      SliverList.builder(
        itemCount: choices.length,
        itemBuilder: (context, index) {
          final choice = choices[index];
          return AppGroupedSlice(
            position: AppSlicePosition.of(index, choices.length),
            dividerInset: AppSpacing.md,
            child: AppOptionTile(
              key: choice.key,
              title: choice.label,
              subtitle: choice.subtitle,
              leading: choice.icon == null ? null : Icon(choice.icon),
              selected: choice.value == selected,
              onTap: () => Navigator.of(context).pop(choice.value),
            ),
          );
        },
      ),
    ],
  );
}

/// Opens an [AppChoiceSheet] and resolves with the picked value, or null
/// when the sheet is dismissed.
Future<T?> showAppChoiceSheet<T>({
  required BuildContext context,
  required String title,
  required List<AppSheetChoice<T>> choices,
  required T? selected,
  String? description,
  bool useRootNavigator = false,
}) => showAppSheet<T>(
  context: context,
  useRootNavigator: useRootNavigator,
  builder: (_) => AppChoiceSheet<T>(
    title: title,
    description: description,
    choices: choices,
    selected: selected,
  ),
);

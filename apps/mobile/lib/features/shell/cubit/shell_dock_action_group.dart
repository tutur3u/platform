import 'package:equatable/equatable.dart';
import 'package:flutter/widgets.dart';

/// One entry of a dock action group's More sheet.
///
/// A [ShellDockGroupAction] is a plain row; a [ShellDockChoice] is a row with
/// a segmented choice below it. Items are identified by [id]: the shell
/// diffs, keys and deduplicates them by id.
sealed class ShellDockMoreItem extends Equatable {
  const ShellDockMoreItem();

  String get id;
  IconData get icon;
  String get label;
}

/// A momentary dock button: a pill slot, the circle, or a More-sheet row.
class ShellDockGroupAction extends ShellDockMoreItem {
  const ShellDockGroupAction({
    required this.id,
    required this.icon,
    required this.label,
    this.enabled = true,
    this.onPressed,
    this.destructive = false,
  });

  @override
  final String id;
  @override
  final IconData icon;

  /// Visible label and semantics label.
  @override
  final String label;
  final bool enabled;
  final VoidCallback? onPressed;

  /// Uses the destructive colour token in the More sheet.
  final bool destructive;

  @override
  List<Object?> get props => [
    id,
    icon.codePoint,
    icon.fontFamily,
    icon.fontPackage,
    icon.matchTextDirection,
    label,
    enabled,
    onPressed,
    destructive,
  ];
}

/// A More-sheet row with a segmented single choice, such as a message theme.
class ShellDockChoice extends ShellDockMoreItem {
  const ShellDockChoice({
    required this.id,
    required this.icon,
    required this.label,
    required this.options,
    required this.selectedId,
    required this.onSelected,
  });

  @override
  final String id;
  @override
  final IconData icon;
  @override
  final String label;
  final List<({String id, String label})> options;
  final String selectedId;

  /// Receives the chosen option id. The sheet stays open, so the owner can
  /// apply the choice live.
  final ValueChanged<String> onSelected;

  @override
  List<Object?> get props => [
    id,
    icon.codePoint,
    icon.fontFamily,
    icon.fontPackage,
    label,
    options,
    selectedId,
    onSelected,
  ];
}

/// The dock contents an owner page registers in place of navigation:
/// [actions] fill the pill (the shell appends More when [more] or folded
/// actions need it), [primary] fills the circle, and [more] lists the More
/// sheet's sections, separated in the sheet.
///
/// Whatever [primary] holds is never repeated: the shell drops every pill
/// and More entry whose id equals `primary.id`.
class ShellDockActionGroup extends Equatable {
  const ShellDockActionGroup({
    this.actions = const [],
    this.more = const [],
    this.primary,
  });

  final List<ShellDockGroupAction> actions;
  final List<List<ShellDockMoreItem>> more;
  final ShellDockGroupAction? primary;

  /// Pill actions without the [primary] id.
  List<ShellDockGroupAction> get pillActions {
    final primaryId = primary?.id;
    return [
      for (final action in actions)
        if (action.id != primaryId) action,
    ];
  }

  /// More sections without the [primary] id, empty sections removed.
  List<List<ShellDockMoreItem>> get moreSections {
    final primaryId = primary?.id;
    return [
      for (final section in more)
        if (section.where((item) => item.id != primaryId).toList()
            case final items when items.isNotEmpty)
          items,
    ];
  }

  @override
  List<Object?> get props => [actions, more, primary];
}

import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/l10n/l10n.dart';

/// Task priorities in the web's order, with the web's labels, icons and
/// colours.
///
/// Mirrors `PRIORITY_LABELS`, `PRIORITY_ICONS` and `PRIORITY_BADGE_COLORS` in
/// `packages/tasks-ui/src/tu-do/utils` and the task priority menu: Urgent,
/// High, Medium and Low (vi: Khẩn cấp, Cao, Trung bình, Thấp), plus None for
/// no priority. Critical is the Lucide Lab unicorn
/// head, high the horse head, normal the rabbit and low the turtle, tinted
/// with the shared dynamic red, orange, yellow and blue tokens.
enum TaskPriorityLevel {
  critical('critical'),
  high('high'),
  normal('normal'),
  low('low');

  const TaskPriorityLevel(this.value);

  /// The stored `tasks.priority` value.
  final String value;

  /// The level for a stored value, or null when the value is unknown.
  static TaskPriorityLevel? tryParse(String? raw) {
    final normalized = raw?.trim().toLowerCase();
    for (final level in values) {
      if (level.value == normalized) return level;
    }
    return null;
  }

  IconData get icon => switch (this) {
    TaskPriorityLevel.critical => LucideLabIcons.unicornHead,
    TaskPriorityLevel.high => LucideLabIcons.horseHead,
    TaskPriorityLevel.normal => LucideIcons.rabbit,
    TaskPriorityLevel.low => LucideIcons.turtle,
  };

  Color color(DynamicColors palette) => switch (this) {
    TaskPriorityLevel.critical => palette.red,
    TaskPriorityLevel.high => palette.orange,
    TaskPriorityLevel.normal => palette.yellow,
    TaskPriorityLevel.low => palette.blue,
  };

  String label(AppLocalizations l10n) => switch (this) {
    TaskPriorityLevel.critical => l10n.tasksPriorityUrgent,
    TaskPriorityLevel.high => l10n.tasksPriorityHigh,
    TaskPriorityLevel.normal => l10n.tasksPriorityMedium,
    TaskPriorityLevel.low => l10n.tasksPriorityLow,
  };

  /// The web's "None" choice: no priority.
  static String noneLabel(AppLocalizations l10n) => l10n.tasksPriorityNone;

  /// The web's icon for the "None" choice.
  static const IconData noneIcon = LucideIcons.x;
}

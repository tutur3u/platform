import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/l10n/l10n.dart';

/// Converts an activity instant to the wall-clock time it is shown in.
typedef TimelineDateConverter = DateTime Function(DateTime instant);

/// Whether the loaded activity is the whole recent history, a partial view
/// (a source failed or hit its display limit) or unavailable.
enum ProfileTimelineAvailability { complete, partial, unavailable }

/// The calendar day of [instant] after [convert].
DateTime profileTimelineDay(DateTime instant, TimelineDateConverter convert) {
  final local = convert(instant);
  return DateTime(local.year, local.month, local.day);
}

/// Newest day first, newest item first within a day. Cached snapshots are
/// sorted too: their order is not an API guarantee. Ties break on the item
/// identity so equal timestamps render in a stable order.
Map<DateTime, List<ProfileTimelineItem>> groupProfileTimelineDays(
  List<ProfileTimelineItem> items, {
  DateTime Function(DateTime)? convertDate,
}) {
  final sorted = [...items]
    ..sort((a, b) {
      final order = b.createdAt.compareTo(a.createdAt);
      return order != 0
          ? order
          : '${a.type}:${a.id}'.compareTo('${b.type}:${b.id}');
    });
  final days = <DateTime, List<ProfileTimelineItem>>{};
  for (final item in sorted) {
    final date = convertDate?.call(item.createdAt) ?? item.createdAt.toLocal();
    days
        .putIfAbsent(DateTime(date.year, date.month, date.day), () => [])
        .add(item);
  }
  return days;
}

/// Presentation of one activity source: its label, icon and tone. Each
/// source keeps its app's tone so a row reads the same as in that app.
extension ProfileTimelineItemKind on ProfileTimelineItem {
  /// Item types that open a destination.
  static const openableTypes = {'task', 'transaction', 'note', 'calendar'};

  bool get canOpen => openableTypes.contains(type);

  String? get trimmedTitle {
    final value = title?.trim();
    return value == null || value.isEmpty ? null : value;
  }

  /// Calendar rows have no reliable creator, so they read as workspace
  /// events rather than something the user added.
  String kindLabel(BuildContext context) => switch (type) {
    'task' => context.l10n.profileTimelineKindTask,
    'transaction' => context.l10n.profileTimelineKindTransaction,
    'note' => context.l10n.profileTimelineKindNote,
    'calendar' => context.l10n.profileTimelineKindWorkspaceEvent,
    _ => context.l10n.profileTimelineTitle,
  };

  IconData get kindIcon => switch (type) {
    'task' => LucideIcons.circleCheck,
    'transaction' => LucideIcons.wallet,
    'note' => LucideIcons.notebookPen,
    'calendar' => LucideIcons.calendarDays,
    _ => LucideIcons.history,
  };

  AppTone get kindTone => switch (type) {
    'task' => AppTone.success,
    'transaction' => AppTone.warning,
    'note' => AppTone.primary,
    'calendar' => AppTone.info,
    _ => AppTone.neutral,
  };
}

import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/l10n/l10n.dart';

/// An activity source the timeline can be narrowed to.
enum ProfileTimelineSource {
  tasks('task'),
  calendar('calendar'),
  finance('transaction'),
  notes('note');

  const ProfileTimelineSource(this.type);

  /// The [ProfileTimelineItem.type] this source covers.
  final String type;

  String label(BuildContext context) => switch (this) {
    tasks => context.l10n.profileTimelineSourceTasks,
    calendar => context.l10n.profileTimelineSourceCalendar,
    finance => context.l10n.profileTimelineSourceFinance,
    notes => context.l10n.profileTimelineSourceNotes,
  };

  IconData get icon => switch (this) {
    tasks => LucideIcons.circleCheck,
    calendar => LucideIcons.calendarDays,
    finance => LucideIcons.wallet,
    notes => LucideIcons.notebookPen,
  };
}

/// What the timeline shows: every loaded day or today only, one source or
/// all of them, and an optional title search. Filtering only narrows the
/// loaded activity; it never changes what is fetched.
@immutable
class ProfileTimelineFilter {
  const ProfileTimelineFilter({
    this.todayOnly = false,
    this.source,
    this.query = '',
  });

  final bool todayOnly;

  /// Null shows every source.
  final ProfileTimelineSource? source;
  final String query;

  bool get isActive => todayOnly || source != null || query.trim().isNotEmpty;

  ProfileTimelineFilter copyWith({
    bool? todayOnly,
    ProfileTimelineSource? Function()? source,
    String? query,
  }) => ProfileTimelineFilter(
    todayOnly: todayOnly ?? this.todayOnly,
    source: source == null ? this.source : source(),
    query: query ?? this.query,
  );

  /// Whether [item], shown on [day], passes this filter for [today].
  bool accepts(ProfileTimelineItem item, DateTime day, DateTime today) {
    if (todayOnly && day != today) return false;
    if (source case final source? when item.type != source.type) return false;
    final needle = query.trim().toLowerCase();
    if (needle.isEmpty) return true;
    return item.title?.toLowerCase().contains(needle) ?? false;
  }

  @override
  bool operator ==(Object other) =>
      other is ProfileTimelineFilter &&
      other.todayOnly == todayOnly &&
      other.source == source &&
      other.query == query;

  @override
  int get hashCode => Object.hash(todayOnly, source, query);
}

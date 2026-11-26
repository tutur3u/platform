import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/features/calendar/cubit/calendar_series_cubit.dart';
import 'package:mobile/features/calendar/utils/calendar_recurrence_draft.dart';
import 'package:mobile/features/calendar/widgets/recurrence_pattern_sheet.dart';
import 'package:mobile/features/settings/view/timezone_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// How the event form takes part in a native recurring series.
class EventRecurrenceOptions {
  const EventRecurrenceOptions({
    required this.timeZone,
    required this.onSubmit,
    this.pattern,
    this.scope,
    this.showFutureReset = false,
  });

  /// Rule time zone; the device or calendar zone for a new series.
  final String timeZone;

  /// Current pattern, or null while a new event does not repeat.
  final RecurrencePattern? pattern;

  /// The edited scope, or null when creating.
  final CalendarRecurrenceScope? scope;
  final bool showFutureReset;

  /// Applies a series write while the form stays open, so a failure keeps
  /// the draft. Returns why it did not apply, or null once it did.
  final Future<CalendarSeriesFailure?> Function(Map<String, dynamic> result)
  onSubmit;

  bool get occurrenceOnly => scope == CalendarRecurrenceScope.occurrence;
}

String recurrenceFailureMessage(
  AppLocalizations l10n,
  CalendarSeriesFailure failure,
) => switch (failure) {
  CalendarSeriesFailure.offline => l10n.calendarRecurrenceOffline,
  CalendarSeriesFailure.conflict => l10n.calendarRecurrenceConflict,
  CalendarSeriesFailure.denied => l10n.calendarRecurrenceDenied,
  CalendarSeriesFailure.invalid => l10n.calendarRecurrenceInvalid,
  CalendarSeriesFailure.unavailable => l10n.calendarRecurrenceUnavailable,
  CalendarSeriesFailure.failed => l10n.calendarRecurrenceFailed,
};

/// Repeat and time zone rows. Hidden for a single occurrence, which cannot
/// change its series pattern.
class EventRecurrenceRows extends StatelessWidget {
  const EventRecurrenceRows({
    required this.options,
    required this.pattern,
    required this.timeZone,
    required this.start,
    required this.onPattern,
    required this.onTimeZone,
    super.key,
  });

  final EventRecurrenceOptions options;
  final RecurrencePattern? pattern;
  final String timeZone;

  /// Series start as a wall-clock carrier in [timeZone].
  final DateTime start;
  final ValueChanged<RecurrencePattern?> onPattern;
  final ValueChanged<String> onTimeZone;

  Future<void> _editPattern(BuildContext context) async {
    final picked = await showRecurrencePatternSheet(
      context,
      initial: pattern ?? RecurrencePattern.initial(start),
      start: start,
      allowNone: options.scope == null,
    );
    if (picked != null) onPattern(picked.pattern);
  }

  Future<void> _editTimeZone(BuildContext context) async {
    final picked = await showAppSheet<String>(
      context: context,
      size: AppSheetSize.large,
      builder: (_) => TimezonePickerSheet(
        workspace: false,
        selected: timeZone == options.timeZone ? 'auto' : timeZone,
        automaticZone: options.timeZone,
      ),
    );
    if (picked == null) return;
    onTimeZone(picked == 'auto' ? options.timeZone : picked);
  }

  @override
  Widget build(BuildContext context) {
    if (options.occurrenceOnly) return const SizedBox.shrink();
    final l10n = context.l10n;
    final textStyle = Theme.of(context).textTheme.bodyMedium;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(l10n.calendarRecurrenceRepeat, style: textStyle),
            ),
            AppChip(
              label: Text(recurrenceSummary(l10n, pattern)),
              onPressed: () => _editPattern(context),
            ),
          ],
        ),
        if (pattern != null) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(l10n.calendarRecurrenceTimezone, style: textStyle),
              ),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 220),
                child: AppChip(
                  label: Text(timeZone, overflow: TextOverflow.ellipsis),
                  onPressed: () => _editTimeZone(context),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

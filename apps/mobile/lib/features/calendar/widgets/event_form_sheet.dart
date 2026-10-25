import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/widgets/google_calendar_color_picker.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shows a bottom sheet (compact) or dialog (medium+) for creating or editing
/// a calendar event.
///
/// Returns the event data as a [Map] if saved, or `null` if dismissed.
Future<Map<String, dynamic>?> showEventFormSheet(
  BuildContext context, {
  CalendarEvent? event,
  DateTime? initialStartTime,
  String? timezone,
  GoogleCalendarColorOptions? providerColors,
  Future<GoogleCalendarColorOptions?>? providerColorsFuture,
  bool Function()? isCurrentScope,
}) {
  return showAppSheet<Map<String, dynamic>>(
    context: context,
    builder: (context) => _EventFormContent(
      event: event,
      initialStartTime: initialStartTime,
      timezone: timezone,
      providerColors: providerColors,
      providerColorsFuture: providerColorsFuture,
      isCurrentScope: isCurrentScope,
    ),
  );
}

class _EventFormContent extends StatefulWidget {
  const _EventFormContent({
    this.event,
    this.initialStartTime,
    this.timezone,
    this.providerColors,
    this.providerColorsFuture,
    this.isCurrentScope,
  });

  final CalendarEvent? event;
  final DateTime? initialStartTime;
  final String? timezone;
  final GoogleCalendarColorOptions? providerColors;
  final Future<GoogleCalendarColorOptions?>? providerColorsFuture;
  final bool Function()? isCurrentScope;

  @override
  State<_EventFormContent> createState() => _EventFormContentState();
}

class _EventFormContentState extends State<_EventFormContent> {
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  late DateTime _startDate;
  late TimeOfDay _startTime;
  late DateTime _endDate;
  late TimeOfDay _endTime;
  late bool _isAllDay;
  late String _color;
  DateTime? _originalStart;
  DateTime? _originalEnd;
  DateTime? _initialStartWall;
  DateTime? _initialEndWall;
  bool? _initialAllDay;
  String? _dateTimeError;
  GoogleCalendarColorChoice? _providerColor;
  GoogleCalendarColorChoice? _initialProviderColor;
  GoogleCalendarColorOptions? _providerColors;

  bool get _canUseProviderColors =>
      widget.event?.provider == 'google' &&
      _providerColors?.writesEnabled == true &&
      _providerColors!.options.isNotEmpty;

  bool get _isEditing => widget.event != null;

  @override
  void initState() {
    super.initState();
    _providerColors = widget.providerColors;
    _initialProviderColor = _storedProviderColor(_providerColors);
    unawaited(
      widget.providerColorsFuture?.then((colors) {
        if (!mounted || widget.isCurrentScope?.call() == false) return;
        setState(() {
          _providerColors = colors;
          _initialProviderColor = _storedProviderColor(colors);
        });
      }),
    );
    _originalStart = widget.event?.startAt;
    _originalEnd = widget.event?.endAt;
    final event = widget.event == null
        ? null
        : calendarProjectEvent(widget.event!, widget.timezone);

    _titleController = TextEditingController(text: event?.title ?? '');
    _descriptionController = TextEditingController(
      text: event?.description ?? '',
    );

    if (event != null) {
      final start = event.startAt ?? calendarNow(widget.timezone);
      final end = event.endAt ?? start.add(const Duration(hours: 1));
      _startDate = start;
      _startTime = TimeOfDay.fromDateTime(start);
      _endDate = event.isAllDay
          ? calendarDate(end.year, end.month, end.day - 1)
          : end;
      _endTime = TimeOfDay.fromDateTime(end);
      _isAllDay = event.isAllDay;
      _initialAllDay = _isAllDay;
      _initialStartWall = start;
      _initialEndWall = end;
      _color = event.color ?? 'BLUE';
    } else {
      final initial =
          widget.initialStartTime ??
          _roundToQuarter(calendarNow(widget.timezone));
      _startDate = initial;
      _startTime = TimeOfDay.fromDateTime(initial);
      final end = initial.add(const Duration(hours: 1));
      _endDate = end;
      _endTime = TimeOfDay.fromDateTime(end);
      _isAllDay = false;
      _color = 'BLUE';
    }
  }

  GoogleCalendarColorChoice? _storedProviderColor(
    GoogleCalendarColorOptions? colors,
  ) {
    final metadata = widget.event?.schedulingMetadata?['google_color'];
    if (metadata is! Map || colors == null) return null;
    final kind = metadata['inherited'] == true
        ? 'inherit'
        : metadata['event_label_id'] is String
        ? 'label'
        : metadata['color_id'] is String
        ? 'event'
        : null;
    final id = kind == 'label'
        ? metadata['event_label_id']
        : kind == 'event'
        ? metadata['color_id']
        : null;
    for (final option in colors.options) {
      if (option.kind == kind && option.id == id) {
        return option.choice(colors.connectionId);
      }
    }
    return null;
  }

  DateTime _roundToQuarter(DateTime dt) {
    final minutes = (dt.minute / 15).ceil() * 15;
    return calendarDate(dt.year, dt.month, dt.day, dt.hour, minutes);
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  DateTime _combineDateAndTime(DateTime date, TimeOfDay time) {
    return calendarDate(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
  }

  bool _sameDisplayedMinute(DateTime? initial, DateTime selected) =>
      initial != null &&
      initial.year == selected.year &&
      initial.month == selected.month &&
      initial.day == selected.day &&
      initial.hour == selected.hour &&
      initial.minute == selected.minute;

  void _save() {
    if (widget.isCurrentScope?.call() == false) {
      setState(() => _dateTimeError = context.l10n.calendarEventUnavailable);
      return;
    }
    final title = _titleController.text.trim();
    if (title.isEmpty) return;

    final startAt = _isAllDay
        ? calendarDate(_startDate.year, _startDate.month, _startDate.day)
        : _combineDateAndTime(_startDate, _startTime);
    // The selected end date is inclusive; stored end midnight is exclusive.
    final endAt = _isAllDay
        ? calendarDate(_endDate.year, _endDate.month, _endDate.day + 1)
        : _combineDateAndTime(_endDate, _endTime);

    try {
      // An unchanged ambiguous fall-back wall time keeps its stored instant.
      final start =
          _initialAllDay == _isAllDay &&
              _sameDisplayedMinute(_initialStartWall, startAt) &&
              _originalStart != null
          ? _originalStart!.toUtc()
          : calendarWallToUtc(startAt, widget.timezone);
      final end =
          _initialAllDay == _isAllDay &&
              _sameDisplayedMinute(_initialEndWall, endAt) &&
              _originalEnd != null
          ? _originalEnd!.toUtc()
          : calendarWallToUtc(endAt, widget.timezone);
      if (!end.isAfter(start)) throw const FormatException('Invalid range');
      if (_providerColor != null) {
        final original = widget.event!;
        if (title != (original.title ?? '').trim() ||
            _descriptionController.text.trim() !=
                (original.description ?? '').trim() ||
            start != _originalStart?.toUtc() ||
            end != _originalEnd?.toUtc() ||
            _isAllDay != _initialAllDay ||
            _color != (original.color ?? 'BLUE')) {
          setState(
            () =>
                _dateTimeError = context.l10n.calendarProviderColorSeparateEdit,
          );
          return;
        }
        Navigator.of(
          context,
        ).pop(<String, dynamic>{'providerColor': _providerColor});
        return;
      }
      Navigator.of(context).pop(<String, dynamic>{
        'title': title,
        'description': _descriptionController.text.trim(),
        'startAt': start,
        'endAt': end,
        'color': _color,
      });
    } on FormatException {
      setState(() => _dateTimeError = context.l10n.calendarInvalidLocalTime);
    }
  }

  Future<void> _pickDate(bool isStart) async {
    final initial = isStart ? _startDate : _endDate;
    final picked = await showAppDatePicker(
      context: context,
      initialDate: initial,
      firstDate: calendarDate(2020),
      lastDate: calendarDate(2100),
    );
    if (picked == null) return;
    final date = calendarDate(picked.year, picked.month, picked.day);
    setState(() {
      if (isStart) {
        _startDate = date;
        if (_endDate.isBefore(_startDate)) _endDate = _startDate;
      } else {
        _endDate = date;
      }
    });
  }

  Future<void> _pickTime(bool isStart) async {
    final initial = isStart ? _startTime : _endTime;
    final picked = await showAppTimePicker(
      context: context,
      initialTime: initial,
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startTime = picked;
      } else {
        _endTime = picked;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;
    final dateFormat = DateFormat.yMMMd();

    return AppSheetScaffold(
      title: _isEditing ? l10n.calendarEditEvent : l10n.calendarNewEvent,
      actions: [
        AppButton.ghost(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.calendarEventCancel),
        ),
        AppButton.primary(
          onPressed: _titleController.text.trim().isNotEmpty ? _save : null,
          child: Text(l10n.calendarEventSave),
        ),
      ],
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_dateTimeError != null)
            Text(_dateTimeError!, style: TextStyle(color: colorScheme.error)),
          const SizedBox(height: 16),

          // Title.
          AppTextField(
            controller: _titleController,
            textCapitalization: TextCapitalization.sentences,
            autofocus: !_isEditing,
            onChanged: (_) => setState(() {}),
            label: l10n.calendarEventTitle,
            placeholder: l10n.calendarEventTitleHint,
          ),
          const SizedBox(height: 12),

          // Description.
          AppTextField(
            controller: _descriptionController,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            label: l10n.calendarEventDescription,
            placeholder: l10n.calendarEventDescriptionHint,
          ),
          const SizedBox(height: 12),

          // All-day toggle.
          AppToggleRow(
            title: Text(l10n.calendarEventAllDay),
            value: _isAllDay,
            onChanged: (v) => setState(() => _isAllDay = v),
          ),

          // Start date/time.
          _DateTimeRow(
            label: l10n.calendarEventStartDate,
            dateText: dateFormat.format(_startDate),
            timeText: _isAllDay ? null : _startTime.format(context),
            onDateTap: () => _pickDate(true),
            onTimeTap: _isAllDay ? null : () => _pickTime(true),
          ),
          const SizedBox(height: 8),

          // End date/time.
          _DateTimeRow(
            label: l10n.calendarEventEndDate,
            dateText: dateFormat.format(_endDate),
            timeText: _isAllDay ? null : _endTime.format(context),
            onDateTap: () => _pickDate(false),
            onTimeTap: _isAllDay ? null : () => _pickTime(false),
          ),
          const SizedBox(height: 16),

          // Color picker.
          Text(
            l10n.calendarEventColor,
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 8),
          if (_canUseProviderColors)
            GoogleCalendarColorPicker(
              colors: _providerColors!,
              selected: _providerColor ?? _initialProviderColor,
              onChanged: (choice) => setState(() => _providerColor = choice),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: EventColors.allColors.map((name) {
                final c = EventColors.fromString(name);
                final selected = _color == name;
                return GestureDetector(
                  onTap: () => setState(() => _color = name),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: c,
                      shape: BoxShape.circle,
                      border: selected
                          ? Border.all(color: colorScheme.onSurface, width: 2)
                          : null,
                    ),
                    child: selected
                        ? Icon(
                            LucideIcons.check,
                            size: 16,
                            color: colorScheme.surface,
                          )
                        : null,
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }
}

class _DateTimeRow extends StatelessWidget {
  const _DateTimeRow({
    required this.label,
    required this.dateText,
    required this.onDateTap,
    this.timeText,
    this.onTimeTap,
  });

  final String label;
  final String dateText;
  final String? timeText;
  final VoidCallback onDateTap;
  final VoidCallback? onTimeTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
        ),
        AppChip(label: Text(dateText), onPressed: onDateTap),
        if (timeText != null) ...[
          const SizedBox(width: 8),
          AppChip(label: Text(timeText!), onPressed: onTimeTap),
        ],
      ],
    );
  }
}

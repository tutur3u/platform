import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shows a bottom sheet for creating or editing a calendar event.
///
/// Returns the event data as a [Map] if saved, or `null` if dismissed.
Future<Map<String, dynamic>?> showEventFormSheet(
  BuildContext context, {
  CalendarEvent? event,
  DateTime? initialStartTime,
}) {
  return showModalBottomSheet<Map<String, dynamic>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => _EventFormContent(
      event: event,
      initialStartTime: initialStartTime,
    ),
  );
}

class _EventFormContent extends StatefulWidget {
  const _EventFormContent({this.event, this.initialStartTime});

  final CalendarEvent? event;
  final DateTime? initialStartTime;

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

  bool get _isEditing => widget.event != null;

  @override
  void initState() {
    super.initState();
    final event = widget.event;

    _titleController = TextEditingController(text: event?.title ?? '');
    _descriptionController = TextEditingController(
      text: event?.description ?? '',
    );

    if (event != null) {
      final start = event.startAt ?? DateTime.now();
      final end = event.endAt ?? start.add(const Duration(hours: 1));
      _startDate = start;
      _startTime = TimeOfDay.fromDateTime(start);
      _endDate = end;
      _endTime = TimeOfDay.fromDateTime(end);
      _isAllDay = event.isAllDay;
      _color = event.color ?? 'BLUE';
    } else {
      final initial =
          widget.initialStartTime ?? _roundToQuarter(DateTime.now());
      _startDate = initial;
      _startTime = TimeOfDay.fromDateTime(initial);
      final end = initial.add(const Duration(hours: 1));
      _endDate = end;
      _endTime = TimeOfDay.fromDateTime(end);
      _isAllDay = false;
      _color = 'BLUE';
    }
  }

  DateTime _roundToQuarter(DateTime dt) {
    final minutes = (dt.minute / 15).ceil() * 15;
    return DateTime(dt.year, dt.month, dt.day, dt.hour, minutes);
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  DateTime _combineDateAndTime(DateTime date, TimeOfDay time) {
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  void _save() {
    final title = _titleController.text.trim();
    if (title.isEmpty) return;

    final startAt = _isAllDay
        ? DateTime(_startDate.year, _startDate.month, _startDate.day)
        : _combineDateAndTime(_startDate, _startTime);
    // For all-day events, set endAt to midnight of (endDate + 1 day) so the
    // duration is an exact multiple of 24 hours — this is how the computed
    // `CalendarEvent.isAllDay` getter detects all-day events.
    final endAt = _isAllDay
        ? DateTime(_endDate.year, _endDate.month, _endDate.day + 1)
        : _combineDateAndTime(_endDate, _endTime);

    Navigator.of(context).pop(<String, dynamic>{
      'title': title,
      'description': _descriptionController.text.trim(),
      'startAt': startAt,
      'endAt': endAt,
      'color': _color,
    });
  }

  Future<void> _pickDate(bool isStart) async {
    final initial = isStart ? _startDate : _endDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startDate = picked;
        if (_endDate.isBefore(_startDate)) _endDate = _startDate;
      } else {
        _endDate = picked;
      }
    });
  }

  Future<void> _pickTime(bool isStart) async {
    final initial = isStart ? _startTime : _endTime;
    final picked = await showTimePicker(
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

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header.
            Row(
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(l10n.calendarEventCancel),
                ),
                const Spacer(),
                Text(
                  _isEditing ? l10n.calendarEditEvent : l10n.calendarNewEvent,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: _titleController.text.trim().isNotEmpty
                      ? _save
                      : null,
                  child: Text(l10n.calendarEventSave),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Title.
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                labelText: l10n.calendarEventTitle,
                hintText: l10n.calendarEventTitleHint,
                border: const OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.sentences,
              autofocus: !_isEditing,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),

            // Description.
            TextField(
              controller: _descriptionController,
              decoration: InputDecoration(
                labelText: l10n.calendarEventDescription,
                hintText: l10n.calendarEventDescriptionHint,
                border: const OutlineInputBorder(),
              ),
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),

            // All-day toggle.
            SwitchListTile(
              title: Text(l10n.calendarEventAllDay),
              value: _isAllDay,
              onChanged: (v) => setState(() => _isAllDay = v),
              contentPadding: EdgeInsets.zero,
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
                          ? Border.all(
                              color: colorScheme.onSurface,
                              width: 2,
                            )
                          : null,
                    ),
                    child: selected
                        ? Icon(
                            Icons.check,
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
    final colorScheme = Theme.of(context).colorScheme;

    return Row(
      children: [
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
        ),
        ActionChip(
          label: Text(dateText),
          onPressed: onDateTap,
          side: BorderSide(color: colorScheme.outlineVariant),
        ),
        if (timeText != null) ...[
          const SizedBox(width: 8),
          ActionChip(
            label: Text(timeText!),
            onPressed: onTimeTap,
            side: BorderSide(color: colorScheme.outlineVariant),
          ),
        ],
      ],
    );
  }
}

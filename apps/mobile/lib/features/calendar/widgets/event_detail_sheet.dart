import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shows a read-only bottom sheet with event details plus edit/delete actions.
///
/// Returns `'edit'` if the user taps Edit, `'delete'` if they confirm Delete,
/// or `null` if dismissed.
Future<String?> showEventDetailSheet(
  BuildContext context, {
  required CalendarEvent event,
}) {
  return showModalBottomSheet<String>(
    context: context,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => _EventDetailContent(event: event),
  );
}

class _EventDetailContent extends StatelessWidget {
  const _EventDetailContent({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final color = EventColors.fromString(event.color);
    final dateFormat = DateFormat.yMMMd();
    final timeFormat = DateFormat.jm();

    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Color header.
          Container(
            height: 6,
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          // Title.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              event.title ?? '',
              style: textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Date and time.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Icon(
                  Icons.schedule,
                  size: 18,
                  color: colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 8),
                Text(
                  _formatDateRange(dateFormat, timeFormat),
                  style: textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),

          // Description.
          if (event.description?.isNotEmpty ?? false) ...[
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                event.description!,
                style: textTheme.bodyMedium,
              ),
            ),
          ],

          const SizedBox(height: 24),

          // Action buttons.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).pop('edit'),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: Text(l10n.calendarEditEvent),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _confirmDelete(context),
                    icon: Icon(
                      Icons.delete_outline,
                      size: 18,
                      color: colorScheme.error,
                    ),
                    label: Text(
                      l10n.calendarDeleteEvent,
                      style: TextStyle(color: colorScheme.error),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: colorScheme.error),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateRange(DateFormat dateFormat, DateFormat timeFormat) {
    final start = event.startAt;
    final end = event.endAt;

    if (start == null) return '';

    if (event.isAllDay) {
      if (end == null || !event.isMultiDay) {
        return dateFormat.format(start);
      }
      return '${dateFormat.format(start)} – ${dateFormat.format(end)}';
    }

    if (end == null) {
      return '${dateFormat.format(start)} '
          '${timeFormat.format(start)}';
    }

    if (start.year == end.year &&
        start.month == end.month &&
        start.day == end.day) {
      return '${dateFormat.format(start)}  '
          '${timeFormat.format(start)} – '
          '${timeFormat.format(end)}';
    }

    return '${dateFormat.format(start)} '
        '${timeFormat.format(start)} – '
        '${dateFormat.format(end)} '
        '${timeFormat.format(end)}';
  }

  void _confirmDelete(BuildContext context) {
    final l10n = context.l10n;

    unawaited(
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.calendarDeleteEvent),
          content: Text(l10n.calendarDeleteConfirm),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(l10n.calendarEventCancel),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop(); // Close dialog.
                Navigator.of(context).pop('delete'); // Close sheet.
              },
              child: Text(
                l10n.calendarEventDelete,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

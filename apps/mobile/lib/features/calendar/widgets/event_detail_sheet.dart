import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_location.dart';
import 'package:mobile/features/calendar/utils/calendar_time_format.dart';
import 'package:mobile/features/calendar/utils/event_tone.dart';
import 'package:mobile/features/calendar/widgets/calendar_description_body.dart';
import 'package:mobile/l10n/l10n.dart';

/// Returns edit/delete only after the corresponding action is confirmed.
Future<String?> showEventDetailSheet(
  BuildContext context, {
  required CalendarEvent event,
  bool readOnly = false,
}) => showAdaptiveSheet<String>(
  context: context,
  useRootNavigator: true,
  backgroundColor: AppTokens.of(context).colorScheme.popover,
  builder: (context) => EventDetailContent(event: event, readOnly: readOnly),
);

/// Displays the event properties supplied by the calendar API.
class EventDetailContent extends StatelessWidget {
  const EventDetailContent({
    required this.event,
    this.readOnly = false,
    super.key,
  });
  final CalendarEvent event;
  final bool readOnly;
  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final start = event.startAt;
    final end = event.endAt;
    final date = start == null ? '' : DateFormat.MMMEd(locale).format(start);
    final times = formatCalendarTimeRange(context, start, end);
    final endDate = end != null && event.isMultiDay
        ? ' – ${DateFormat.MMMEd(locale).format(end)}'
        : '';
    final place = event.place;
    final mapUri = calendarLocationMapUri(place);
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        24 + MediaQuery.viewPaddingOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 6,
                height: 64,
                decoration: BoxDecoration(
                  color: AppEventBlock.hueOf(context, eventTone(event)).ink,
                  borderRadius: BorderRadius.circular(tokens.shapes.card),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.title ?? '',
                      style: tokens.typography.title.copyWith(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '$date$endDate',
                      style: tokens.typography.bodySm.copyWith(
                        color: c.mutedForeground,
                      ),
                    ),
                    Text(
                      event.isAllDay ? l10n.calendarAllDay : times,
                      style: tokens.typography.numeric.copyWith(
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              if (!readOnly)
                IconButton(
                  tooltip: l10n.calendarEditEvent,
                  onPressed: () => Navigator.of(context).pop('edit'),
                  icon: const Icon(Icons.edit_outlined),
                ),
              IconButton(
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          if (place != null && mapUri != null) ...[
            const SizedBox(height: 16),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: AppButton.ghost(
                semanticLabel: l10n.calendarEventOpenLocation,
                leading: const Icon(LucideIcons.mapPin),
                onPressed: () => openMobileLink(context, mapUri),
                child: Text(
                  place,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
          if (event.description?.isNotEmpty ?? false) ...[
            const SizedBox(height: 24),
            CalendarDescriptionBody(description: event.description!),
          ],
          if (!readOnly) ...[
            const SizedBox(height: 24),
            TextButton.icon(
              onPressed: () => _delete(context),
              icon: const Icon(Icons.delete_outline),
              label: Text(l10n.calendarDeleteEvent),
              style: TextButton.styleFrom(foregroundColor: c.destructive),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _delete(BuildContext context) async {
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.calendarDeleteEvent,
      message: l10n.calendarDeleteConfirm,
      confirmLabel: l10n.calendarEventDelete,
      cancelLabel: l10n.calendarEventCancel,
      destructive: true,
    );
    if (confirmed && context.mounted) Navigator.of(context).pop('delete');
  }
}

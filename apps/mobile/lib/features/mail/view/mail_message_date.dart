import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/mail/view/mail_message_delivery.dart';
import 'package:mobile/l10n/l10n.dart';

DateTime? mailMessageDate(Map<String, dynamic> message, {bool thread = false}) {
  for (final field in [
    if (thread) 'lastMessageAt',
    'sentAt',
    'receivedAt',
    'createdAt',
  ]) {
    final value = message[field];
    if (value is! String && field != 'sentAt') continue;
    final parsed = field == 'sentAt'
        ? mailSentDate(message)
        : parseMailDeliveryDate(value);
    if (parsed != null) return parsed.toLocal();
  }
  return null;
}

String formatMailMessageDate(
  BuildContext context,
  DateTime date, {
  bool compact = false,
  DateTime? now,
}) {
  final local = date.toLocal();
  final today = (now ?? DateTime.now()).toLocal();
  final locale = Localizations.localeOf(context).toLanguageTag();
  final time = MaterialLocalizations.of(context).formatTimeOfDay(
    TimeOfDay.fromDateTime(local),
    alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
  );
  if (compact && DateUtils.isSameDay(local, today)) return time;
  final formattedDate = compact && local.year == today.year
      ? _formats
            .putIfAbsent(('MMMd', locale), () => DateFormat.MMMd(locale))
            .format(local)
      : _formats
            .putIfAbsent(('yMMMd', locale), () => DateFormat.yMMMd(locale))
            .format(local);
  return compact ? formattedDate : '$formattedDate · $time';
}

/// Inbox rows format a date on every build while scrolling; building a
/// [DateFormat] parses its locale pattern, so reuse one per locale.
final Map<(String, String), DateFormat> _formats = {};

/// "Just now", "12m ago" and "4h ago" within the last 12 hours, then the
/// compact date ("Nov 21", or with the year when it differs).
String formatMailRelativeDate(
  BuildContext context,
  DateTime date, {
  DateTime? now,
}) {
  final current = (now ?? DateTime.now()).toLocal();
  final elapsed = current.difference(date.toLocal());
  final l10n = context.l10n;
  if (elapsed.isNegative || elapsed < const Duration(minutes: 1)) {
    return elapsed < const Duration(minutes: -1)
        ? formatMailMessageDate(context, date, compact: true, now: current)
        : l10n.mailTimeJustNow;
  }
  if (elapsed < const Duration(hours: 1)) {
    return l10n.mailTimeMinutesAgo(elapsed.inMinutes);
  }
  if (elapsed < const Duration(hours: 12)) {
    return l10n.mailTimeHoursAgo(elapsed.inHours);
  }
  return formatMailMessageDate(context, date, compact: true, now: current);
}

/// A list row's date, as on web: the time today, the day and month this
/// year, and the full day, month and year for older mail.
String formatMailThreadDate(
  DateTime date, {
  required String locale,
  required bool use24HourFormat,
  DateTime? now,
}) {
  final local = date.toLocal();
  final today = (now ?? DateTime.now()).toLocal();
  final pattern = DateUtils.isSameDay(local, today)
      ? (use24HourFormat ? 'Hm' : 'jm')
      : local.year == today.year
      ? 'MMMd'
      : 'yMMMd';
  return _formats
      .putIfAbsent(
        (pattern, locale),
        () => switch (pattern) {
          'Hm' => DateFormat.Hm(locale),
          'jm' => DateFormat.jm(locale),
          // Locale skeletons, as web's Intl.DateTimeFormat: "Mar 4" in en.
          'MMMd' => DateFormat.MMMd(locale),
          _ => DateFormat.yMMMd(locale),
        },
      )
      .format(local);
}

/// The full timestamp a row's date shows in its tooltip.
String formatMailThreadDateTitle(
  DateTime date, {
  required String locale,
  required bool use24HourFormat,
}) => _formats
    .putIfAbsent((use24HourFormat ? 'yMMMd Hm' : 'yMMMd jm', locale), () {
      final format = DateFormat.yMMMd(locale);
      return use24HourFormat ? format.add_Hm() : format.add_jm();
    })
    .format(date.toLocal());

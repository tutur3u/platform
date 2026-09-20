import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

DateTime? mailMessageDate(Map<String, dynamic> message, {bool thread = false}) {
  for (final field in [
    if (thread) 'lastMessageAt',
    'sentAt',
    'receivedAt',
    'createdAt',
  ]) {
    final value = message[field];
    if (value is! String) continue;
    final parsed = DateTime.tryParse(value);
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
      ? DateFormat.MMMd(locale).format(local)
      : DateFormat.yMMMd(locale).format(local);
  return compact ? formattedDate : '$formattedDate · $time';
}

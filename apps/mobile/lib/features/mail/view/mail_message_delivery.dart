import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

DateTime? parseMailDeliveryDate(Object? value) {
  if (value is! String || value.trim().isEmpty) return null;
  final isoParts = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value);
  if (isoParts != null) {
    final year = int.parse(isoParts[1]!);
    final month = int.parse(isoParts[2]!);
    final day = int.parse(isoParts[3]!);
    final date = DateTime.utc(year, month, day);
    if (date.year != year || date.month != month || date.day != day) {
      return null;
    }
  }
  final isoTime = RegExp(
    r'[T ](\d{2}):?(\d{2})(?::?(\d{2})(?:[.,]\d+)?)?(?:[zZ]|([+-])(\d{2})(?::?(\d{2}))?)?$',
  ).firstMatch(value);
  if (isoParts != null && value.length > 10) {
    if (isoTime == null ||
        int.parse(isoTime[1]!) > 23 ||
        int.parse(isoTime[2]!) > 59 ||
        int.parse(isoTime[3] ?? '0') > 59 ||
        int.parse(isoTime[5] ?? '0') > 23 ||
        int.parse(isoTime[6] ?? '0') > 59) {
      return null;
    }
  }
  final iso = DateTime.tryParse(value);
  if (iso != null) return iso.toLocal();
  final match = RegExp(
    r'^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|GMT|UT|UTC)(?:\s*\([^)]*\))?$',
    caseSensitive: false,
  ).firstMatch(value.trim());
  if (match == null) return null;
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  final month = months.indexOf(match[2]!.toLowerCase()) + 1;
  final day = int.parse(match[1]!);
  final year = int.parse(match[3]!);
  final hour = int.parse(match[4]!);
  final minute = int.parse(match[5]!);
  final second = int.parse(match[6] ?? '0');
  if (month == 0 || hour > 23 || minute > 59 || second > 59) return null;
  final utc = DateTime.utc(year, month, day, hour, minute, second);
  if (utc.year != year || utc.month != month || utc.day != day) return null;
  final zone = match[7]!;
  var offset = 0;
  if (zone.startsWith('+') || zone.startsWith('-')) {
    final hours = int.parse(zone.substring(1, 3));
    final minutes = int.parse(zone.substring(3, 5));
    if (hours > 23 || minutes > 59) return null;
    offset = (hours * 60 + minutes) * (zone.startsWith('-') ? -1 : 1);
  }
  return utc.subtract(Duration(minutes: offset)).toLocal();
}

DateTime? mailSentDate(Map<String, dynamic> message) {
  final headers = message['safeHeaders'];
  return parseMailDeliveryDate(message['sentAt']) ??
      parseMailDeliveryDate(headers is Map ? headers['date'] : null);
}

DateTime? mailDistinctReceivedDate(Map<String, dynamic> message) {
  final received = parseMailDeliveryDate(message['receivedAt']);
  final sent = mailSentDate(message);
  if (received == null ||
      (sent != null && received.difference(sent).inSeconds.abs() < 60)) {
    return null;
  }
  return received;
}

String formatMailDeliveryDate(BuildContext context, DateTime date) {
  final local = date.toLocal();
  final offset = local.timeZoneOffset.inMinutes;
  final hours = (offset.abs() ~/ 60).toString().padLeft(2, '0');
  final minutes = (offset.abs() % 60).toString().padLeft(2, '0');
  final zone = 'GMT${offset < 0 ? '-' : '+'}$hours:$minutes';
  final locale = Localizations.localeOf(context).toLanguageTag();
  return '${DateFormat.yMMMd(locale).add_Hms().format(local)} $zone';
}

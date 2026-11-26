import 'package:flutter/material.dart';
import 'package:html/parser.dart' as html;
import 'package:intl/intl.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// Clock time in the device's 12/24-hour preference.
String chatClockTime(BuildContext context, DateTime at) =>
    MaterialLocalizations.of(context).formatTimeOfDay(
      TimeOfDay.fromDateTime(at.toLocal()),
      alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
    );

/// List timestamp: time today, "Yesterday", weekday this week, else a date.
String chatListTime(BuildContext context, DateTime at, {DateTime? now}) {
  final local = at.toLocal();
  final today = now ?? DateTime.now();
  final locale = Localizations.localeOf(context).toLanguageTag();
  if (_sameDay(local, today)) return chatClockTime(context, local);
  if (_sameDay(local, today.subtract(const Duration(days: 1)))) {
    return context.l10n.chatYesterday;
  }
  if (today.difference(local).inDays < 7) {
    return DateFormat.E(locale).format(local);
  }
  if (local.year == today.year) return DateFormat.MMMd(locale).format(local);
  return DateFormat.yMd(locale).format(local);
}

/// Day separator label: "Today", "Yesterday" or a full date.
String chatDayLabel(BuildContext context, DateTime day, {DateTime? now}) {
  final today = now ?? DateTime.now();
  final locale = Localizations.localeOf(context).toLanguageTag();
  if (_sameDay(day, today)) return context.l10n.chatToday;
  if (_sameDay(day, today.subtract(const Duration(days: 1)))) {
    return context.l10n.chatYesterday;
  }
  if (day.year == today.year) return DateFormat.MMMMEEEEd(locale).format(day);
  return DateFormat.yMMMMEEEEd(locale).format(day);
}

/// Sender label for a message, matching web's assistant/unknown fallbacks.
String chatSenderName(BuildContext context, ChatMessage message) {
  if (message.kind == ChatMessageKind.assistant) {
    return message.sender?.displayName ?? 'Mira';
  }
  final name = message.sender?.displayName.trim();
  return name == null || name.isEmpty ? context.l10n.chatUnknownSender : name;
}

/// One-line text for previews and reply quotes.
String chatMessagePreview(BuildContext context, ChatMessage message) {
  final l10n = context.l10n;
  if (message.deletedAt != null) return l10n.chatMessageDeleted;
  final text = chatMessageDisplayContent(
    message,
  ).replaceAll(RegExp('[*_`>#]+'), '').replaceAll(RegExp(r'\s+'), ' ').trim();
  if (text.isNotEmpty) return text;
  if (message.attachments.isNotEmpty) {
    return message.attachments.length == 1
        ? message.attachments.first.filename
        : l10n.chatAttachmentCount(message.attachments.length);
  }
  return '';
}

String chatInitials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList(growable: false);
  if (parts.isEmpty) return '?';
  final first = parts.first.characters.first;
  final last = parts.length > 1 ? parts.last.characters.first : '';
  return (first + last).toUpperCase();
}

final _htmlEntity = RegExp(
  '&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);',
);

/// Message text as web displays it: bridged external chat stores HTML
/// entities, decoded here up to three passes as web does. Entities are
/// decoded one at a time, so decoded `<` and `>` never become markup.
String chatMessageDisplayContent(ChatMessage message) {
  if (message.metadata['externalChat'] != true) return message.content;
  var content = message.content;
  for (var pass = 0; pass < 3; pass++) {
    final decoded = content.replaceAllMapped(
      _htmlEntity,
      (match) => html.parseFragment(match[0]).text ?? match[0]!,
    );
    if (decoded == content) break;
    content = decoded;
  }
  return content;
}

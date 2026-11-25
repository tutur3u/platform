import 'dart:convert';

/// The entity kinds the web's mention menu offers, in its group order.
enum DocumentMentionType { user, workspace, project, task, date }

/// One entry in the mention picker, shaped like the web's `MentionOption`.
class DocumentMentionOption {
  const DocumentMentionOption({
    required this.id,
    required this.label,
    required this.type,
    this.subtitle,
    this.avatarUrl,
    this.displayNumber,
    this.priority,
    this.workspaceId,
    this.listColor,
    this.assignees,
  });

  final String id;
  final String label;
  final DocumentMentionType type;
  final String? subtitle;
  final String? avatarUrl;

  /// A task's number, which the web shows on the chip instead of its name.
  final int? displayNumber;
  final String? priority;
  final String? workspaceId;

  /// A task's list colour and assignees, which the web's task chip shows.
  final String? listColor;
  final List<Map<String, dynamic>>? assignees;

  String get entityType => type.name;
}

/// The mention node's attributes as the web stores them: every attribute
/// of its schema, in schema order, unset ones null.
///
/// A task shows its number and keeps its name as the subtitle, as the
/// web's task mentions do.
Map<String, dynamic> documentMentionAttrs(DocumentMentionOption option) {
  final task = option.type == DocumentMentionType.task;
  return {
    'userId': option.type == DocumentMentionType.user ? option.id : null,
    'entityId': option.id,
    'entityType': option.entityType,
    'displayName': task && option.displayNumber != null
        ? '${option.displayNumber}'
        : option.label,
    'avatarUrl': option.avatarUrl,
    'subtitle': task ? option.label : option.subtitle,
    'priority': task ? option.priority : null,
    'listColor': task ? option.listColor : null,
    // The web stores a task's assignees as a JSON string.
    'assignees': task && option.assignees != null
        ? jsonEncode(option.assignees)
        : null,
    'workspaceId': task ? option.workspaceId : null,
  };
}

/// The Quill mention embed value for [option].
String documentMentionEmbedValue(DocumentMentionOption option) =>
    jsonEncode(documentMentionAttrs(option));

/// The web's date shortcuts relative to [now]. Their stored names and
/// dates are the web's (`Today`, `Nov 25, 2026`), so a mention reads the
/// same on every platform.
List<DocumentMentionOption> documentDateMentionOptions(DateTime now) {
  final day = DateTime(now.year, now.month, now.day);
  return [
    _date('today', 'Today', day),
    _date('tomorrow', 'Tomorrow', day.add(const Duration(days: 1))),
    _date('next-week', 'Next week', day.add(const Duration(days: 7))),
    _date(
      'next-month',
      'Next month',
      DateTime(day.year, day.month + 1, day.day),
    ),
  ];
}

/// A mention for a date the user picked, stored as the web stores one.
DocumentMentionOption documentCustomDateMention(DateTime date) =>
    DocumentMentionOption(
      id: 'custom-${date.toUtc().toIso8601String()}',
      label: _webDate(date),
      type: DocumentMentionType.date,
    );

DocumentMentionOption _date(String id, String label, DateTime date) =>
    DocumentMentionOption(
      id: id,
      label: label,
      subtitle: _webDate(date),
      type: DocumentMentionType.date,
    );

const List<String> _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/// The web's `MMM D, YYYY` date, in English as the web writes it.
String _webDate(DateTime date) =>
    '${_months[date.month - 1]} ${date.day}, ${date.year}';

/// The options matching [query], by label or subtitle, ignoring case.
///
/// [labelOf] gives the label the picker shows, such as a date shortcut's
/// localized name; it defaults to the stored label.
List<DocumentMentionOption> filterDocumentMentions(
  List<DocumentMentionOption> options,
  String query, {
  String Function(DocumentMentionOption option)? labelOf,
}) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return options;
  return [
    for (final option in options)
      if ((labelOf?.call(option) ?? option.label).toLowerCase().contains(q) ||
          option.label.toLowerCase().contains(q) ||
          (option.subtitle?.toLowerCase().contains(q) ?? false))
        option,
  ];
}

/// Whether a typed `@` at [offset] in [text] starts a mention: at the start
/// of a line or after a space, as the web's suggestion trigger requires.
bool startsDocumentMention(String text, int offset) {
  if (offset < 0 || offset >= text.length || text[offset] != '@') return false;
  if (offset == 0) return true;
  final before = text[offset - 1];
  return before == ' ' || before == '\n' || before == '\t';
}

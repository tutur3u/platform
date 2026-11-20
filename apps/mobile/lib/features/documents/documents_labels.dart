import 'package:intl/intl.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/l10n/l10n.dart';

String documentOwnerLabel(WorkspaceDocument document, AppLocalizations l10n) {
  if (document.ownerIsViewer) return l10n.documentsOwnerYou;
  final name = document.ownerName?.trim();
  return name == null || name.isEmpty ? l10n.documentsOwnerUnknown : name;
}

enum DocumentVisibilityFilter { all, privateOnly, publicOnly }

enum DocumentSort { edited, title }

bool documentNameIsUntitled(String name) {
  final trimmed = name.trim().toLowerCase();
  return trimmed.isEmpty ||
      trimmed == 'untitled' ||
      trimmed == 'untitled document' ||
      trimmed == 'chưa đặt tên' ||
      trimmed == 'tài liệu chưa đặt tên';
}

DateTime? documentEditedAt(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  return DateTime.tryParse(trimmed);
}

/// Visible title. A blank or placeholder name becomes "Untitled · Nov 19".
String documentDisplayTitle({
  required String name,
  required String untitled,
  required DateTime? editedAt,
  required String locale,
}) {
  if (!documentNameIsUntitled(name)) return name.trim();
  if (editedAt == null) return untitled;
  final date = DateFormat.MMMd(locale).format(editedAt.toLocal());
  return '$untitled · $date';
}

import 'dart:convert';

import 'package:equatable/equatable.dart';

String _stringValue(Object? value, {String fallback = ''}) {
  if (value is String) return value;
  return fallback;
}

/// TipTap content arrives as a JSON object. Keep it as text so the editor
/// codec can read it, without dropping the document when it is not a string.
String _contentValue(Object? value) {
  if (value is String) return value;
  if (value is Map || value is List) return jsonEncode(value);
  return '';
}

bool _boolValue(Object? value) {
  if (value is bool) return value;
  if (value is String) return value.toLowerCase() == 'true';
  return false;
}

String? _optionalString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

String? _ownerName(Map<String, dynamic> json) {
  final direct = _optionalString(json['owner_name'] ?? json['ownerName']);
  if (direct != null) return direct;
  final owner = json['owner'];
  if (owner is! Map) return null;
  return _optionalString(owner['full_name']);
}

class WorkspaceDocument extends Equatable {
  const WorkspaceDocument({
    required this.id,
    required this.name,
    required this.content,
    required this.isPublic,
    this.createdAt = '',
    this.updatedAt = '',
    this.ownerId,
    this.ownerName,
    this.ownerIsViewer = false,
  });

  factory WorkspaceDocument.fromJson(Map<String, dynamic> json) {
    return WorkspaceDocument(
      id: _stringValue(json['id']),
      name: _stringValue(json['name']),
      content: _contentValue(json['content']),
      isPublic: _boolValue(json['is_public'] ?? json['isPublic']),
      createdAt: _stringValue(json['created_at'] ?? json['createdAt']),
      updatedAt: _stringValue(json['updated_at'] ?? json['updatedAt']),
      ownerId: _optionalString(json['owner_id'] ?? json['ownerId']),
      ownerName: _ownerName(json),
      ownerIsViewer: _boolValue(
        json['owner_is_viewer'] ?? json['ownerIsViewer'],
      ),
    );
  }

  final String id;
  final String name;
  final String content;
  final bool isPublic;
  final String createdAt;
  final String updatedAt;
  final String? ownerId;
  final String? ownerName;
  final bool ownerIsViewer;

  /// Last edit when the API recorded one, otherwise the create time.
  String get editedAtRaw => updatedAt.trim().isNotEmpty ? updatedAt : createdAt;

  WorkspaceDocument copyWith({
    String? id,
    String? name,
    String? content,
    bool? isPublic,
    String? createdAt,
    String? updatedAt,
    String? ownerId,
    String? ownerName,
    bool? ownerIsViewer,
  }) {
    return WorkspaceDocument(
      id: id ?? this.id,
      name: name ?? this.name,
      content: content ?? this.content,
      isPublic: isPublic ?? this.isPublic,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      ownerId: ownerId ?? this.ownerId,
      ownerName: ownerName ?? this.ownerName,
      ownerIsViewer: ownerIsViewer ?? this.ownerIsViewer,
    );
  }

  @override
  List<Object?> get props => [
    id,
    name,
    content,
    isPublic,
    createdAt,
    updatedAt,
    ownerId,
    ownerName,
    ownerIsViewer,
  ];
}

class WorkspaceDocumentsPage extends Equatable {
  const WorkspaceDocumentsPage({
    required this.documents,
    required this.total,
    required this.limit,
    required this.offset,
  });

  factory WorkspaceDocumentsPage.fromJson(Map<String, dynamic> json) {
    final pagination =
        json['pagination'] as Map<String, dynamic>? ??
        const <String, dynamic>{};
    return WorkspaceDocumentsPage(
      documents: (json['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(WorkspaceDocument.fromJson)
          .toList(growable: false),
      total:
          pagination['filteredTotal'] as int? ??
          pagination['total'] as int? ??
          0,
      limit: pagination['limit'] as int? ?? 0,
      offset: pagination['offset'] as int? ?? 0,
    );
  }

  final List<WorkspaceDocument> documents;
  final int total;
  final int limit;
  final int offset;

  @override
  List<Object?> get props => [documents, total, limit, offset];
}

import 'package:equatable/equatable.dart';

String _stringValue(Object? value, {String fallback = ''}) {
  if (value is String) return value;
  return fallback;
}

bool _boolValue(Object? value) {
  if (value is bool) return value;
  if (value is String) return value.toLowerCase() == 'true';
  return false;
}

class WorkspaceDocument extends Equatable {
  const WorkspaceDocument({
    required this.id,
    required this.name,
    required this.content,
    required this.isPublic,
    this.createdAt = '',
  });

  factory WorkspaceDocument.fromJson(Map<String, dynamic> json) {
    return WorkspaceDocument(
      id: _stringValue(json['id']),
      name: _stringValue(json['name'], fallback: 'Untitled document'),
      content: _stringValue(json['content']),
      isPublic: _boolValue(json['is_public'] ?? json['isPublic']),
      createdAt: _stringValue(json['created_at'] ?? json['createdAt']),
    );
  }

  final String id;
  final String name;
  final String content;
  final bool isPublic;
  final String createdAt;

  WorkspaceDocument copyWith({
    String? id,
    String? name,
    String? content,
    bool? isPublic,
    String? createdAt,
  }) {
    return WorkspaceDocument(
      id: id ?? this.id,
      name: name ?? this.name,
      content: content ?? this.content,
      isPublic: isPublic ?? this.isPublic,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  List<Object?> get props => [id, name, content, isPublic, createdAt];
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

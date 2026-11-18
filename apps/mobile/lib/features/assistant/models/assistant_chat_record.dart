part of 'assistant_models.dart';

class AssistantChatRecord extends Equatable {
  const AssistantChatRecord({
    required this.id,
    this.title,
    this.model,
    this.isPublic = false,
    this.createdAt,
    this.updatedAt,
    this.preview,
  });

  factory AssistantChatRecord.fromJson(Map<String, dynamic> json) =>
      AssistantChatRecord(
        id: json['id'] as String,
        title: json['title'] as String?,
        model: json['model'] as String?,
        isPublic: json['is_public'] as bool? ?? false,
        createdAt: _parseDateTime(json['created_at']),
        updatedAt: _parseDateTime(json['updated_at']),
        preview: json['preview'] as String?,
      );

  final String id;
  final String? title;
  final String? model;
  final bool isPublic;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? preview;

  DateTime? get activityDate => updatedAt ?? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'model': model,
    'is_public': isPublic,
    'created_at': createdAt?.toIso8601String(),
    if (updatedAt != null) 'updated_at': updatedAt!.toIso8601String(),
    if (preview != null) 'preview': preview,
  };

  @override
  List<Object?> get props => [
    id,
    title,
    model,
    isPublic,
    createdAt,
    updatedAt,
    preview,
  ];
}

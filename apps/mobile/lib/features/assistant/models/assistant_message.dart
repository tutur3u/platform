part of 'assistant_models.dart';

class AssistantMessage extends Equatable {
  const AssistantMessage({
    required this.id,
    required this.role,
    this.parts = const [],
    this.createdAt,
    this.liveTurnId,
  });

  factory AssistantMessage.fromJson(Map<String, dynamic> json) =>
      AssistantMessage(
        id: json['id'] as String,
        role: json['role'] as String? ?? 'assistant',
        parts: (json['parts'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(AssistantMessagePart.fromJson)
            .toList(),
        createdAt: _parseDateTime(json['created_at']),
        liveTurnId: json['liveTurnId'] as String?,
      );

  final String id;
  final String role;
  final List<AssistantMessagePart> parts;
  final DateTime? createdAt;
  final String? liveTurnId;

  AssistantMessage copyWith({
    String? id,
    String? role,
    List<AssistantMessagePart>? parts,
    DateTime? createdAt,
    String? liveTurnId,
  }) {
    return AssistantMessage(
      id: id ?? this.id,
      role: role ?? this.role,
      parts: parts ?? this.parts,
      createdAt: createdAt ?? this.createdAt,
      liveTurnId: liveTurnId ?? this.liveTurnId,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role,
    'parts': parts.map((part) => part.toJson()).toList(),
    'created_at': createdAt?.toIso8601String(),
    if (liveTurnId != null) 'liveTurnId': liveTurnId,
  };

  @override
  List<Object?> get props => [id, role, parts, createdAt, liveTurnId];
}

class AssistantMessagePart extends Equatable {
  const AssistantMessagePart({
    required this.type,
    this.text,
    this.toolName,
    this.toolCallId,
    this.state,
    this.input,
    this.output,
    this.sourceId,
    this.url,
    this.title,
    this.metadata,
    this.blockId,
  });

  factory AssistantMessagePart.fromJson(Map<String, dynamic> json) =>
      AssistantMessagePart(
        type: json['type'] as String,
        text: json['text'] as String?,
        toolName: json['toolName'] as String?,
        toolCallId: json['toolCallId'] as String?,
        state: json['state'] as String?,
        input: json['input'],
        output: json['output'],
        sourceId: json['sourceId'] as String?,
        url: json['url'] as String?,
        title: json['title'] as String?,
        metadata: json['metadata'] as Map<String, dynamic>?,
        blockId: json['blockId'] as String?,
      );

  final String type;
  final String? text;
  final String? toolName;
  final String? toolCallId;
  final String? state;
  final dynamic input;
  final dynamic output;
  final String? sourceId;
  final String? url;
  final String? title;
  final Map<String, dynamic>? metadata;
  final String? blockId;

  AssistantMessagePart copyWith({
    String? type,
    String? text,
    String? toolName,
    String? toolCallId,
    String? state,
    dynamic input,
    dynamic output,
    String? sourceId,
    String? url,
    String? title,
    Map<String, dynamic>? metadata,
    String? blockId,
  }) {
    return AssistantMessagePart(
      type: type ?? this.type,
      text: text ?? this.text,
      toolName: toolName ?? this.toolName,
      toolCallId: toolCallId ?? this.toolCallId,
      state: state ?? this.state,
      input: input ?? this.input,
      output: output ?? this.output,
      sourceId: sourceId ?? this.sourceId,
      url: url ?? this.url,
      title: title ?? this.title,
      metadata: metadata ?? this.metadata,
      blockId: blockId ?? this.blockId,
    );
  }

  Map<String, dynamic> toJson() => {
    'type': type,
    'text': text,
    'toolName': toolName,
    'toolCallId': toolCallId,
    'state': state,
    'input': input,
    'output': output,
    'sourceId': sourceId,
    'url': url,
    'title': title,
    'metadata': metadata,
    'blockId': blockId,
  };

  @override
  List<Object?> get props => [
    type,
    text,
    toolName,
    toolCallId,
    state,
    input,
    output,
    sourceId,
    url,
    title,
    metadata,
    blockId,
  ];
}
